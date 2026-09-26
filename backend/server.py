import os
import json
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict

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

MAX_INPUT_CHARS = 1200
MAX_OUTPUT_TOKENS = 700
CONTEXT_TURNS = 6  # bounded conversation memory

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
Keep the whole reply concise. Do not use chat-bubble phrasing, greetings like "Sure" or "As an AI". Do not use Markdown headwith #, tables, or code fences.

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


# ---------------------------------------------------------------------------
# Rate limiting + budget (MongoDB, expiring records — never store transcripts)
# ---------------------------------------------------------------------------
async def ensure_indexes():
    await db.abuse_control.create_index("createdAt", expireAfterSeconds=60)
    await db.messages.create_index([("token", 1), ("ts", 1)])


async def check_rate_limit(token: str, ip: str) -> bool:
    now = datetime.now(timezone.utc)
    key = token or ip
    await db.abuse_control.insert_one({"key": key, "createdAt": now})
    count = await db.abuse_control.count_documents({
        "key": key,
        "createdAt": {"$gte": now - timedelta(seconds=60)},
    })
    return count <= RATE_LIMIT_PER_MIN


async def budget_remaining() -> bool:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = await db.token_budget.find_one({"day": day})
    used = doc["used"] if doc else 0
    return used < DAILY_TOKEN_BUDGET


async def add_budget(tokens: int):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.token_budget.update_one(
        {"day": day}, {"$inc": {"used": tokens}}, upsert=True)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "KALI is present.", "model": KALI_MODEL}


@api_router.get("/session/{token}")
async def get_session(token: str):
    docs = await db.messages.find({"token": token}, {"_id": 0}).sort("ts", 1).to_list(500)
    return {"token": token, "messages": docs}


@api_router.delete("/session/{token}")
async def clear_session(token: str):
    await db.messages.delete_many({"token": token})
    return {"ok": True}


async def stream_reply(token: str, user_text: str):
    """SSE generator that streams Kali's reply and persists messages."""
    # persist user message
    user_msg = Message(role="user", content=user_text)
    await db.messages.insert_one({"token": token, **user_msg.model_dump()})

    history = await db.messages.find(
        {"token": token}, {"_id": 0}).sort("ts", 1).to_list(500)

    system_message = build_context_system(history[:-1])  # exclude just-added msg from context text

    # nudge safety-sensitive inputs
    lowered = user_text.lower()
    if any(h in lowered for h in CRISIS_HINTS):
        system_message += ("\n\nNOTE: The seeker's latest message appears safety-sensitive. "
                           "Apply the SAFETY rules and reply in plain grounded English.")

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"kali-{token}",
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
        await db.messages.insert_one({"token": token, **assistant_msg.model_dump()})
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

    ip = request.client.host if request.client else "anon"
    if not await check_rate_limit(req.token, ip):
        raise HTTPException(status_code=429, detail="Too many requests. Rest a moment.")
    if not await budget_remaining():
        raise HTTPException(status_code=503, detail="The daily offering has been fully received. Return tomorrow.")

    return StreamingResponse(
        stream_reply(req.token, text),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    await ensure_indexes()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
