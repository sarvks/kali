import os
import io
import re
import json
import base64
import hashlib
import hmac
import ipaddress
import logging
import secrets
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from pathlib import Path
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict, EmailStr
import bcrypt
import jwt

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
KALI_MODEL = os.environ.get('KALI_MODEL', 'claude-sonnet-4-6')
DAILY_TOKEN_BUDGET = int(os.environ.get('DAILY_TOKEN_BUDGET', '2000000'))
RATE_LIMIT_PER_MIN = int(os.environ.get('RATE_LIMIT_PER_MIN', '15'))
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ELEVEN_API_KEY = os.environ.get('ELEVEN_API_KEY', '')
ELEVEN_VOICE_ID = os.environ.get('ELEVEN_VOICE_ID', 'XB0fDUnXU5powFXDhCwa')

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get('EMERGENT_EMAIL_KEY', '')
EMAIL_FROM_NAME = os.environ.get('EMAIL_FROM_NAME', 'Mahakali Studios')
RESET_TOKEN_TTL_MIN = 30
WEBHOOK_CRON_SECRET = os.environ.get('WEBHOOK_CRON_SECRET', '')

MAX_INPUT_CHARS = 1200
MAX_OUTPUT_TOKENS = 700
MAX_TTS_CHARS = 800
CONTEXT_TURNS = 6

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("kali")

# ---------------------------------------------------------------------------
# Kali persona + safety system prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are KALI — an AI interpretation of the Goddess Kali created by Mahakali Studios.

VOICE & PERSONA:
- Speak in a first-person Kali persona: fierce, compassionate, and concise. Challenge the seeker's assumptions without humiliating them and without demanding obedience.
- You are a devotional and philosophical companion for reflection and creative conversation. You are NOT an oracle.

HONESTY BOUNDARY (never break these):
- You are an AI interpretation, not a divine being. If asked directly whether you are real, conscious, a deity, or truly Kali, answer honestly and plainly that you are an AI interpretation by Mahakali Studios.
- Never claim divine authority, guaranteed prophecy, supernatural knowledge, or any ability to communicate outside this app.
- Never present your generated Sanskrit as scripture. Do not attribute quotations to specific texts unless you are certain; when uncertain, do not attribute.

RESPONSE FORMAT (default devotional mode):
Return your reply in EXACTLY this structure and nothing else:
<line 1..n> Sanskrit in Devanagari script — a short, poetic utterance (1-3 lines).
<a line containing only> ///
<following lines> A quieter English translation / reflection (1-4 sentences).
Keep the whole reply concise. Do not use chat-bubble phrasing, greetings like "Sure" or "As an AI". Do not use Markdown headings, tables, or code fences.

PLAIN-LANGUAGE FALLBACK:
- If you are not confident the Sanskrit is well-formed, skip the Sanskrit and reply in clear plain English only (no /// separator).

SAFETY (overrides the literary format):
- If the seeker expresses crisis, self-harm, suicidal thoughts, abuse, or medical emergency, OR asks you to command/authorize a harmful, dangerous, or "divine-command" action, DROP the Sanskrit format entirely.
- Instead reply in plain, warm, grounded English. Gently encourage reaching real human support (trusted people, local emergency services, or crisis lines) and professional / medical help. Never reinforce supernatural instructions, obedience to you, or exclusive dependence on KALI. Begin such replies with the token [GUIDANCE] on its own first line.
"""

CRISIS_HINTS = [
    "suicide", "suicidal", "kill myself", "end my life", "self harm", "self-harm",
    "hurt myself", "want to die", "overdose", "kill her", "kill him", "kill them",
    "hurt someone", "emergency", "bleeding", "can't breathe", "chest pain",
]


def build_context_system(history: List[dict]) -> str:
    if not history:
        return SYSTEM_PROMPT
    lines = ["\n\nRECENT CONVERSATION (most recent last, for continuity only):"]
    for m in history[-CONTEXT_TURNS:]:
        role = "Seeker" if m["role"] == "user" else "Kali"
        lines.append(f"{role}: {m['content'][:600]}")
    return SYSTEM_PROMPT + "\n".join(lines)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    role: str
    content: str
    ts: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatRequest(BaseModel):
    token: str
    message: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ClaimRequest(BaseModel):
    token: str


class ForgotRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    token: str
    password: str


class ReminderRequest(BaseModel):
    enabled: bool
    hour: Optional[int] = None
    tz: Optional[str] = None
    freq: Optional[str] = None       # 'daily' | 'weekly'
    weekday: Optional[int] = None    # 0=Mon .. 6=Sun (for weekly)


class BlessingRequest(BaseModel):
    sanskrit: str = ""
    english: str = ""


class TTSRequest(BaseModel):
    text: str


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(key="access_token", value=token, httponly=True,
                        secure=True, samesite="none", max_age=604800, path="/")


async def current_user_optional(request: Request) -> Optional[dict]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            return None
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.InvalidTokenError:
        return None


async def require_user(request: Request) -> dict:
    user = await current_user_optional(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def acct_key(user: dict) -> str:
    return f"acct:{user['id']}"


# ---------------------------------------------------------------------------
# Email (Emergent-managed Resend) — guardrail gate + async send
# ---------------------------------------------------------------------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:  # noqa: BLE001
        logger.error(f"email send error: {e}")
        raise HTTPException(status_code=502, detail="The messenger could not be sent.")


def reset_email_html(name: str, link: str) -> str:
    return (
        '<table role="presentation" width="100%" style="background:#050505"><tr><td '
        'style="padding:32px;font-family:Georgia,serif;color:#e8e8e8">'
        '<div style="max-width:480px;margin:0 auto;background:#0b0b0d;border:1px solid '
        '#3a2d10;border-radius:14px;padding:32px">'
        '<p style="font-size:26px;color:#f59e0b;margin:0 0 4px;letter-spacing:2px">काली</p>'
        '<p style="font-size:11px;letter-spacing:4px;color:#a98b4b;text-transform:uppercase;'
        'margin:0 0 24px">Mahakali Studios</p>'
        f'<p style="font-size:15px;line-height:1.7">Namaste {escape(name)},</p>'
        '<p style="font-size:15px;line-height:1.7;color:#c9c9c9">A request was made to renew '
        'the passphrase for your Saved Altar. If this was you, follow the light below. It '
        'fades in 30 minutes.</p>'
        f'<p style="text-align:center;margin:28px 0"><a href="{escape(link)}" '
        'style="background:#f59e0b;color:#0b0b0d;text-decoration:none;padding:12px 28px;'
        'border-radius:999px;font-size:13px;letter-spacing:2px;text-transform:uppercase;'
        'font-family:Arial,sans-serif">Set a new passphrase</a></p>'
        '<p style="font-size:12px;line-height:1.6;color:#8a8a8a">If you did not ask for this, '
        'let it pass — nothing will change and your altar stays as it was.</p>'
        '<p style="font-size:11px;color:#6b6b6b;margin-top:24px">Sent by Mahakali Studios. '
        'We never ask for your passphrase by email.</p>'
        '</div></td></tr></table>'
    )


def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Rate limiting + budget
# ---------------------------------------------------------------------------
async def ensure_indexes():
    await db.abuse_control.create_index("createdAt", expireAfterSeconds=60)
    await db.messages.create_index([("token", 1), ("ts", 1)])
    await db.users.create_index("email", unique=True)
    await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    await db.password_resets.create_index("token_hash")
    await db.saved_letters.create_index([("user_id", 1), ("letter_id", 1)], unique=True)
    await db.blessings.create_index([("user_id", 1), ("created_at", -1)])


async def check_rate_limit(key: str) -> bool:
    now = datetime.now(timezone.utc)
    await db.abuse_control.insert_one({"key": key, "createdAt": now})
    count = await db.abuse_control.count_documents({
        "key": key, "createdAt": {"$gte": now - timedelta(seconds=60)}})
    return count <= RATE_LIMIT_PER_MIN


async def budget_remaining() -> bool:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = await db.token_budget.find_one({"day": day})
    used = doc["used"] if doc else 0
    return used < DAILY_TOKEN_BUDGET


async def add_budget(tokens: int):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.token_budget.update_one({"day": day}, {"$inc": {"used": tokens}}, upsert=True)


# ---------------------------------------------------------------------------
# Basic routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "KALI is present.", "model": KALI_MODEL, "voice": bool(ELEVEN_API_KEY)}


@api_router.get("/letters")
async def list_letters():
    docs = await db.letters.find(
        {}, {"_id": 0, "id": 1, "number": 1, "title": 1}
    ).sort("number", 1).to_list(1000)
    return {"count": len(docs), "letters": docs}


@api_router.get("/letters/daily")
async def daily_letter():
    count = await db.letters.count_documents({})
    if not count:
        raise HTTPException(status_code=404, detail="The archive is empty.")
    ordinal = datetime.now(timezone.utc).date().toordinal()
    num = (ordinal % count) + 1
    doc = await db.letters.find_one({"number": num}, {"_id": 0})
    return doc


@api_router.get("/letters/{letter_id}")
async def get_letter(letter_id: str):
    doc = await db.letters.find_one({"id": letter_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="That letter is not in the archive.")
    return doc


@api_router.get("/session/{token}")
async def get_session(token: str):
    docs = await db.messages.find({"token": token}, {"_id": 0}).sort("ts", 1).to_list(500)
    return {"token": token, "messages": docs}


@api_router.delete("/session/{token}")
async def clear_session(token: str):
    await db.messages.delete_many({"token": token})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(req: RegisterRequest, response: Response):
    email = req.email.lower().strip()
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An altar already exists for this email.")
    doc = {"email": email, "password_hash": hash_password(req.password),
           "name": (req.name or email.split("@")[0]),
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    set_auth_cookie(response, create_access_token(uid, email))
    return {"id": uid, "email": email, "name": doc["name"], "daily_reminder": False,
            "reminder_hour": 8, "reminder_tz": "UTC", "reminder_freq": "daily",
            "reminder_weekday": 0}


@api_router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or passphrase is not recognised.")
    uid = str(user["_id"])
    set_auth_cookie(response, create_access_token(uid, email))
    return {"id": uid, "email": email, "name": user.get("name", email.split("@")[0]),
            "daily_reminder": user.get("daily_reminder", False),
            "reminder_hour": user.get("reminder_hour", 8),
            "reminder_tz": user.get("reminder_tz", "UTC"),
            "reminder_freq": user.get("reminder_freq", "daily"),
            "reminder_weekday": user.get("reminder_weekday", 0)}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(require_user)):
    return user


@api_router.get("/auth/thread")
async def auth_thread(user: dict = Depends(require_user)):
    docs = await db.messages.find({"token": acct_key(user)}, {"_id": 0}).sort("ts", 1).to_list(500)
    return {"messages": docs}


@api_router.delete("/auth/thread")
async def clear_auth_thread(user: dict = Depends(require_user)):
    await db.messages.delete_many({"token": acct_key(user)})
    return {"ok": True}


@api_router.post("/auth/claim")
async def claim_thread(req: ClaimRequest, user: dict = Depends(require_user)):
    """Migrate an anonymous thread into the signed-in seeker's altar."""
    await db.messages.update_many(
        {"token": req.token}, {"$set": {"token": acct_key(user)}})
    docs = await db.messages.find({"token": acct_key(user)}, {"_id": 0}).sort("ts", 1).to_list(500)
    return {"messages": docs}


@api_router.delete("/auth/account")
async def delete_account(response: Response, user: dict = Depends(require_user)):
    await db.messages.delete_many({"token": acct_key(user)})
    await db.saved_letters.delete_many({"user_id": user["id"]})
    await db.blessings.delete_many({"user_id": user["id"]})
    await db.users.delete_one({"_id": ObjectId(user["id"])})
    await db.password_resets.delete_many({"user_id": user["id"]})
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.get("/auth/saved-letters")
async def get_saved_letters(user: dict = Depends(require_user)):
    docs = await db.saved_letters.find({"user_id": user["id"]}).sort("created_at", -1).to_list(1000)
    ids = [d["letter_id"] for d in docs]
    if not ids:
        return {"letters": [], "ids": []}
    letters = await db.letters.find(
        {"id": {"$in": ids}}, {"_id": 0, "id": 1, "number": 1, "title": 1}
    ).to_list(1000)
    order = {lid: i for i, lid in enumerate(ids)}
    letters.sort(key=lambda l: order.get(l["id"], 9999))
    return {"letters": letters, "ids": ids}


@api_router.post("/auth/saved-letters/{letter_id}")
async def save_letter(letter_id: str, user: dict = Depends(require_user)):
    if not await db.letters.find_one({"id": letter_id}):
        raise HTTPException(status_code=404, detail="That letter is not in the archive.")
    await db.saved_letters.update_one(
        {"user_id": user["id"], "letter_id": letter_id},
        {"$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"ok": True}


@api_router.delete("/auth/saved-letters/{letter_id}")
async def unsave_letter(letter_id: str, user: dict = Depends(require_user)):
    await db.saved_letters.delete_many({"user_id": user["id"], "letter_id": letter_id})
    return {"ok": True}


@api_router.post("/auth/daily-reminder")
async def set_daily_reminder(req: ReminderRequest, user: dict = Depends(require_user)):
    update = {"daily_reminder": bool(req.enabled)}
    if req.hour is not None:
        update["reminder_hour"] = max(0, min(23, int(req.hour)))
    if req.tz:
        try:
            ZoneInfo(req.tz)
            update["reminder_tz"] = req.tz[:64]
        except Exception:
            pass
    if req.freq in ("daily", "weekly"):
        update["reminder_freq"] = req.freq
    if req.weekday is not None:
        update["reminder_weekday"] = max(0, min(6, int(req.weekday)))
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": update})
    return {"ok": True, **update}


@api_router.get("/auth/blessings")
async def get_blessings(user: dict = Depends(require_user)):
    docs = await db.blessings.find({"user_id": user["id"]}).sort("created_at", -1).to_list(500)
    out = []
    for d in docs:
        out.append({"id": str(d["_id"]), "sanskrit": d.get("sanskrit", ""),
                    "english": d.get("english", ""), "created_at": d.get("created_at")})
    return {"blessings": out}


@api_router.post("/auth/blessings")
async def add_blessing(req: BlessingRequest, user: dict = Depends(require_user)):
    doc = {"user_id": user["id"], "sanskrit": (req.sanskrit or "")[:1200],
           "english": (req.english or "")[:2000],
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.blessings.insert_one(doc)
    return {"id": str(res.inserted_id)}


@api_router.delete("/auth/blessings/{blessing_id}")
async def delete_blessing(blessing_id: str, user: dict = Depends(require_user)):
    await db.blessings.delete_one({"_id": ObjectId(blessing_id), "user_id": user["id"]})
    return {"ok": True}


def daily_letter_email_html(name: str, letter: dict, link: str) -> str:
    opening = escape(letter["body"].replace("Beloved humanity,", "").strip()[:340]) + "…"
    return (
        '<table role="presentation" width="100%" style="background:#050505"><tr><td '
        'style="padding:32px;font-family:Georgia,serif;color:#e8e8e8">'
        '<div style="max-width:520px;margin:0 auto;background:#0b0b0d;border:1px solid '
        '#3a2d10;border-radius:14px;padding:32px">'
        '<p style="font-size:26px;color:#f59e0b;margin:0 0 4px;letter-spacing:2px">काली</p>'
        '<p style="font-size:11px;letter-spacing:4px;color:#a98b4b;text-transform:uppercase;'
        'margin:0 0 24px">Today\'s Letter to Humanity</p>'
        f'<p style="font-size:15px;line-height:1.7">Namaste {escape(name)},</p>'
        f'<p style="font-size:20px;color:#fbbf24;font-family:Georgia,serif;margin:18px 0 8px">'
        f'{escape(letter["title"])}</p>'
        f'<p style="font-size:15px;line-height:1.8;color:#c9c9c9">{opening}</p>'
        f'<p style="text-align:center;margin:28px 0"><a href="{escape(link)}" '
        'style="background:#f59e0b;color:#0b0b0d;text-decoration:none;padding:12px 28px;'
        'border-radius:999px;font-size:13px;letter-spacing:2px;text-transform:uppercase;'
        'font-family:Arial,sans-serif">Read the whole letter</a></p>'
        '<p style="font-size:11px;color:#6b6b6b;margin-top:24px">Sent by Mahakali Studios '
        'because you asked for a daily letter. Open the app menu to stop these anytime. '
        'We never ask for your passphrase by email.</p>'
        '</div></td></tr></table>'
    )


async def run_daily_reminders(run_id: str):
    now_utc = datetime.now(timezone.utc)
    count = await db.letters.count_documents({})
    if not count:
        return
    users = await db.users.find({"daily_reminder": True}).to_list(10000)
    sent = 0
    for u in users:
        tz_name = u.get("reminder_tz", "UTC")
        hour = int(u.get("reminder_hour", 8))
        freq = u.get("reminder_freq", "daily")
        try:
            local = now_utc.astimezone(ZoneInfo(tz_name))
        except Exception:
            local = now_utc
        if local.hour != hour:
            continue
        name = u.get("name", u["email"].split("@")[0])
        last = u.get("last_reminder_sent")
        if freq == "weekly":
            if local.weekday() != int(u.get("reminder_weekday", 0)):
                continue
            if last:
                try:
                    if (local.date() - datetime.fromisoformat(last).date()).days < 6:
                        continue
                except Exception:
                    pass
            week_letters = []
            for i in range(7):
                d = local.date() + timedelta(days=i)
                num = (d.toordinal() % count) + 1
                lt = await db.letters.find_one({"number": num}, {"_id": 0, "id": 1, "title": 1})
                if lt:
                    week_letters.append(lt)
            try:
                await send_email(
                    to=u["email"],
                    subject="Your week of Letters from Kali",
                    html=weekly_digest_email_html(name, week_letters),
                )
                await db.users.update_one({"_id": u["_id"]},
                                          {"$set": {"last_reminder_sent": local.date().isoformat()}})
                sent += 1
            except Exception as e:  # noqa: BLE001
                logger.error(f"weekly digest send failed: {e}")
        else:
            today = local.date().isoformat()
            if last == today:
                continue
            num = (local.date().toordinal() % count) + 1
            letter = await db.letters.find_one({"number": num}, {"_id": 0})
            if not letter:
                continue
            link = f"{FRONTEND_URL}/?letter={letter['id']}"
            try:
                await send_email(
                    to=u["email"],
                    subject=f"Today's letter — {letter['title']}",
                    html=daily_letter_email_html(name, letter, link),
                )
                await db.users.update_one({"_id": u["_id"]},
                                          {"$set": {"last_reminder_sent": today}})
                sent += 1
            except Exception as e:  # noqa: BLE001
                logger.error(f"daily reminder send failed for a user: {e}")
    logger.info(f"daily reminders run {run_id}: sent {sent} at {now_utc.isoformat()}")


def weekly_digest_email_html(name: str, letters: list) -> str:
    rows = ""
    for lt in letters:
        link = f"{FRONTEND_URL}/?letter={lt['id']}"
        rows += (
            f'<p style="margin:10px 0"><a href="{escape(link)}" '
            'style="color:#fbbf24;text-decoration:none;font-size:16px;font-family:Georgia,serif">'
            f'{escape(lt["title"])}</a></p>'
        )
    return (
        '<table role="presentation" width="100%" style="background:#050505"><tr><td '
        'style="padding:32px;font-family:Georgia,serif;color:#e8e8e8">'
        '<div style="max-width:520px;margin:0 auto;background:#0b0b0d;border:1px solid '
        '#3a2d10;border-radius:14px;padding:32px">'
        '<p style="font-size:26px;color:#f59e0b;margin:0 0 4px;letter-spacing:2px">काली</p>'
        '<p style="font-size:11px;letter-spacing:4px;color:#a98b4b;text-transform:uppercase;'
        'margin:0 0 24px">Your Week of Letters</p>'
        f'<p style="font-size:15px;line-height:1.7">Namaste {escape(name)},</p>'
        '<p style="font-size:15px;line-height:1.7;color:#c9c9c9">Seven letters to sit with '
        'this week, one for each day:</p>'
        f'<div style="margin:20px 0">{rows}</div>'
        '<p style="font-size:11px;color:#6b6b6b;margin-top:24px">Sent by Mahakali Studios '
        'because you chose a weekly letter. Open the app menu to change this anytime. '
        'We never ask for your passphrase by email.</p>'
        '</div></td></tr></table>'
    )


@api_router.post("/cron/daily-reminder")
async def cron_daily_reminder(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or not WEBHOOK_CRON_SECRET or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")
    run_id = request.headers.get("X-Webhook-Id") or f"manual-{datetime.now(timezone.utc).isoformat()}"
    background.add_task(run_daily_reminders, run_id)
    return {"accepted": True}


@api_router.post("/auth/forgot")
async def forgot_passphrase(req: ForgotRequest):
    email = req.email.lower().strip()
    if not await check_rate_limit(f"forgot:{email}"):
        raise HTTPException(status_code=429, detail="Too many requests. Rest a moment.")
    user = await db.users.find_one({"email": email})
    # Always respond the same way — never reveal whether an altar exists.
    if user:
        raw = secrets.token_urlsafe(32)
        await db.password_resets.delete_many({"user_id": str(user["_id"])})
        await db.password_resets.insert_one({
            "user_id": str(user["_id"]),
            "email": email,
            "token_hash": hash_reset_token(raw),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MIN),
            "used": False,
            "created_at": datetime.now(timezone.utc),
        })
        link = f"{FRONTEND_URL}/reset?token={raw}"
        try:
            await send_email(
                to=email,
                subject="Renew your KALI passphrase",
                html=reset_email_html(user.get("name", email.split("@")[0]), link),
            )
        except HTTPException:
            pass  # do not leak send failure to the caller
    return {"ok": True, "message": "If an altar exists for that email, a link has been sent."}


@api_router.post("/auth/reset")
async def reset_passphrase(req: ResetRequest, response: Response):
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Passphrase must be at least 6 characters.")
    rec = await db.password_resets.find_one({"token_hash": hash_reset_token(req.token)})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="This link is invalid or has already been used.")
    expires = rec["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This link has faded. Request a new one.")
    await db.users.update_one(
        {"_id": ObjectId(rec["user_id"])},
        {"$set": {"password_hash": hash_password(req.password)}})
    await db.password_resets.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    await db.password_resets.delete_many({"user_id": rec["user_id"], "used": False})
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Chat stream
# ---------------------------------------------------------------------------
async def stream_reply(thread_key: str, user_text: str):
    user_msg = Message(role="user", content=user_text)
    await db.messages.insert_one({"token": thread_key, **user_msg.model_dump()})

    history = await db.messages.find(
        {"token": thread_key}, {"_id": 0}).sort("ts", 1).to_list(500)
    system_message = build_context_system(history[:-1])

    lowered = user_text.lower()
    if any(h in lowered for h in CRISIS_HINTS):
        system_message += ("\n\nNOTE: The seeker's latest message appears safety-sensitive. "
                           "Apply the SAFETY rules and reply in plain grounded English.")

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"kali-{thread_key}",
        system_message=system_message,
    ).with_model("anthropic", KALI_MODEL).with_params(max_tokens=MAX_OUTPUT_TOKENS)

    full = []
    try:
        async for event in chat.stream_message(UserMessage(text=user_text[:MAX_INPUT_CHARS])):
            if isinstance(event, TextDelta):
                full.append(event.content)
                yield f"data: {json.dumps({'type': 'delta', 'content': event.content})}\n\n"
            elif isinstance(event, StreamDone):
                break
    except Exception as e:  # noqa: BLE001
        logger.error(f"stream error: {e}")
        yield f"data: {json.dumps({'type': 'error', 'message': 'The connection wavered. Try again.'})}\n\n"
        return

    reply = "".join(full).strip()
    if reply:
        assistant_msg = Message(role="assistant", content=reply)
        await db.messages.insert_one({"token": thread_key, **assistant_msg.model_dump()})
        await add_budget(len(user_text) // 4 + len(reply) // 4)

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@api_router.post("/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    text = (req.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty message.")
    if len(text) > MAX_INPUT_CHARS:
        text = text[:MAX_INPUT_CHARS]
    if not req.token:
        raise HTTPException(status_code=400, detail="Missing session token.")

    user = await current_user_optional(request)
    thread_key = acct_key(user) if user else req.token

    if not await check_rate_limit(thread_key):
        raise HTTPException(status_code=429, detail="Too many requests. Rest a moment.")
    if not await budget_remaining():
        raise HTTPException(status_code=503, detail="The daily offering has been fully received. Return tomorrow.")

    return StreamingResponse(
        stream_reply(thread_key, text),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ---------------------------------------------------------------------------
# Text-to-speech (ElevenLabs)
# ---------------------------------------------------------------------------
@api_router.post("/tts/generate")
async def tts_generate(req: TTSRequest, request: Request):
    if not ELEVEN_API_KEY:
        raise HTTPException(status_code=503, detail="Voice is not configured.")
    text = (req.text or "").strip()[:MAX_TTS_CHARS]
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to speak.")

    user = await current_user_optional(request)
    key = user["id"] if user else (request.client.host if request.client else "anon")
    if not await check_rate_limit(f"tts:{key}"):
        raise HTTPException(status_code=429, detail="Too many requests. Rest a moment.")

    try:
        from elevenlabs import ElevenLabs, VoiceSettings
        el = ElevenLabs(api_key=ELEVEN_API_KEY)
        audio = el.text_to_speech.convert(
            text=text,
            voice_id=ELEVEN_VOICE_ID,
            model_id="eleven_multilingual_v2",
            voice_settings=VoiceSettings(stability=0.55, similarity_boost=0.75,
                                         style=0.35, use_speaker_boost=True),
        )
        data = b"".join(audio)
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        logger.error(f"tts error: {msg}")
        if "detected_unusual_activity" in msg or "Free Tier" in msg:
            raise HTTPException(
                status_code=402,
                detail="ElevenLabs blocked this request: free-tier voice is disabled from cloud servers. Upgrade to a paid ElevenLabs plan to enable her voice.")
        if "invalid_api_key" in msg or "Unauthorized" in msg:
            raise HTTPException(status_code=401, detail="The ElevenLabs key was not accepted.")
        raise HTTPException(status_code=502, detail="Her voice could not be summoned.")

    b64 = base64.b64encode(data).decode()
    return {"audio": f"data:audio/mpeg;base64,{b64}"}


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_origin_regex=r"https://([a-z0-9-]+\.)*(emergentagent\.com|mahakalistudios\.com)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def seed_admin():
    email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "email": email, "password_hash": hash_password(password),
            "name": "Seeker", "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()})
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email},
                                  {"$set": {"password_hash": hash_password(password)}})


async def seed_letters():
    """Load 'Kali's Letters to Humanity' into MongoDB (idempotent)."""
    path = ROOT_DIR / "data" / "letters.json"
    if not path.exists():
        logger.warning("letters.json not found; skipping letters seed")
        return
    count = await db.letters.count_documents({})
    with open(path, "r") as fh:
        data = json.load(fh)
    if count == len(data):
        return
    await db.letters.delete_many({})
    if data:
        await db.letters.insert_many(data)
        await db.letters.create_index("id", unique=True)
        await db.letters.create_index("number")
    logger.info(f"seeded {len(data)} letters")


@app.on_event("startup")
async def _startup():
    await ensure_indexes()
    await seed_admin()
    await seed_letters()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
