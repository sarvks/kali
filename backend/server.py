import os
import io
import json
import base64
import logging
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
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
# Rate limiting + budget
# ---------------------------------------------------------------------------
async def ensure_indexes():
    await db.abuse_control.create_index("createdAt", expireAfterSeconds=60)
    await db.messages.create_index([("token", 1), ("ts", 1)])
    await db.users.create_index("email", unique=True)


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
    return {"id": uid, "email": email, "name": doc["name"]}


@api_router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or passphrase is not recognised.")
    uid = str(user["_id"])
    set_auth_cookie(response, create_access_token(uid, email))
    return {"id": uid, "email": email, "name": user.get("name", email.split("@")[0])}


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
    await db.users.delete_one({"_id": ObjectId(user["id"])})
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


@app.on_event("startup")
async def _startup():
    await ensure_indexes()
    await seed_admin()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
