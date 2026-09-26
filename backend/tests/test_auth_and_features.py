"""Auth + Saved Altar + TTS-not-configured tests for KALI (iteration 2)."""
import os
import json
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://kali-divine.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SEED_EMAIL = "seeker@mahakalistudios.com"
SEED_PASSWORD = "KaliDivine108"


# ---------------- helpers ----------------
def _new_session():
    return requests.Session()


def _stream_collect(session, token, message, timeout=90):
    r = session.post(
        f"{API}/chat/stream",
        json={"token": token, "message": message},
        stream=True,
        timeout=timeout,
    )
    assert r.status_code == 200, f"stream status={r.status_code} body={r.text[:400]}"
    full, done = [], False
    for raw in r.iter_lines(decode_unicode=True):
        if not raw or not raw.startswith("data:"):
            continue
        try:
            evt = json.loads(raw[5:].strip())
        except Exception:
            continue
        if evt.get("type") == "delta":
            full.append(evt.get("content", ""))
        elif evt.get("type") == "done":
            done = True
            break
        elif evt.get("type") == "error":
            pytest.fail(f"stream error: {evt}")
    assert done
    return "".join(full)


# ---------------- Auth: register ----------------
def test_register_success_sets_cookie():
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    s = _new_session()
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "secretpass", "name": "Test"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == email
    assert body["name"] == "Test"
    assert "id" in body and isinstance(body["id"], str)
    # cookie set
    assert "access_token" in s.cookies.get_dict(), f"cookies={s.cookies.get_dict()}"
    # /me works
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == email
    # cleanup
    s.delete(f"{API}/auth/account")


def test_register_duplicate_email_400():
    email = f"dup_{uuid.uuid4().hex[:10]}@example.com"
    s = _new_session()
    r1 = s.post(f"{API}/auth/register", json={"email": email, "password": "secretpass"})
    assert r1.status_code == 200
    r2 = requests.post(f"{API}/auth/register", json={"email": email, "password": "secretpass"})
    assert r2.status_code == 400
    s.delete(f"{API}/auth/account")


def test_register_short_password_400():
    email = f"short_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "abc"})
    assert r.status_code == 400


# ---------------- Auth: login ----------------
def test_login_seeded_account_success():
    s = _new_session()
    r = s.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == SEED_EMAIL
    assert "access_token" in s.cookies.get_dict()
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == SEED_EMAIL


def test_login_wrong_password_401():
    r = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": "WRONG_PASS"})
    assert r.status_code == 401


def test_me_without_cookie_401():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


# ---------------- Saved Altar: claim + cross-device persistence ----------------
def test_claim_migrates_anon_thread_and_auth_chat_uses_acct():
    anon_token = f"TEST-CLAIM-{uuid.uuid4()}"
    # 1) anonymous chat creates messages under anon_token
    anon_sess = _new_session()
    reply = _stream_collect(anon_sess, anon_token, "One breath on the shore.")
    assert reply.strip()
    anon_msgs = requests.get(f"{API}/session/{anon_token}").json()["messages"]
    assert len(anon_msgs) >= 2

    # 2) register a fresh user
    email = f"claim_{uuid.uuid4().hex[:10]}@example.com"
    auth_sess = _new_session()
    r = auth_sess.post(f"{API}/auth/register", json={"email": email, "password": "secretpass"})
    assert r.status_code == 200
    user_id = r.json()["id"]

    # 3) claim the anon token
    c = auth_sess.post(f"{API}/auth/claim", json={"token": anon_token})
    assert c.status_code == 200
    claimed = c.json()["messages"]
    assert len(claimed) == len(anon_msgs)

    # 4) /api/auth/thread returns migrated messages (proves cross-device persistence)
    t = auth_sess.get(f"{API}/auth/thread")
    assert t.status_code == 200
    assert len(t.json()["messages"]) == len(anon_msgs)

    # 5) anon token thread should now be empty (migrated away)
    anon_after = requests.get(f"{API}/session/{anon_token}").json()["messages"]
    assert anon_after == []

    # 6) authenticated chat stores under acct:{id} not anon token
    new_reply = _stream_collect(auth_sess, f"IGNORED-{uuid.uuid4()}", "A second turn.")
    assert new_reply.strip()
    t2 = auth_sess.get(f"{API}/auth/thread")
    msgs2 = t2.json()["messages"]
    assert len(msgs2) >= len(claimed) + 2  # +user +assistant
    assert any("second turn" in m["content"].lower() for m in msgs2 if m["role"] == "user")

    # 7) DELETE /auth/thread clears
    d = auth_sess.delete(f"{API}/auth/thread")
    assert d.status_code == 200
    assert auth_sess.get(f"{API}/auth/thread").json()["messages"] == []

    # 8) DELETE /auth/account removes user + clears cookie
    da = auth_sess.delete(f"{API}/auth/account")
    assert da.status_code == 200
    # subsequent /me should be 401 (cookie cleared)
    me = auth_sess.get(f"{API}/auth/me")
    assert me.status_code == 401


# ---------------- TTS not-configured ----------------
def test_tts_not_configured_503():
    r = requests.post(f"{API}/tts/generate", json={"text": "Om"})
    assert r.status_code == 503
    assert "not configured" in r.json().get("detail", "").lower()
