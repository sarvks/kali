"""Iteration 3: CORS regression + Letters library endpoints for KALI."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://kali-divine.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
CROSS_ORIGIN = "https://kali.mahakalistudios.com"


# ---------------- CORS regression ----------------
def test_cors_get_letters_cross_origin_has_allow_origin_header():
    r = requests.get(f"{API}/letters", headers={"Origin": CROSS_ORIGIN})
    assert r.status_code == 200
    aco = r.headers.get("access-control-allow-origin")
    assert aco == CROSS_ORIGIN, f"expected {CROSS_ORIGIN}, got {aco!r}"
    assert r.headers.get("access-control-allow-credentials") == "true"


def test_cors_preflight_chat_stream_permitted():
    r = requests.options(
        f"{API}/chat/stream",
        headers={
            "Origin": CROSS_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code in (200, 204)
    assert r.headers.get("access-control-allow-origin") == CROSS_ORIGIN
    methods = r.headers.get("access-control-allow-methods", "")
    assert "POST" in methods


# ---------------- Letters library ----------------
def test_letters_list_returns_400_titles():
    r = requests.get(f"{API}/letters")
    assert r.status_code == 200
    data = r.json()
    letters = data.get("letters", data) if isinstance(data, dict) else data
    assert isinstance(letters, list)
    assert len(letters) == 400
    first = letters[0]
    assert "id" in first and "number" in first and "title" in first
    assert isinstance(first["title"], str) and first["title"].strip()


def test_letters_detail_has_body():
    r = requests.get(f"{API}/letters/MT-KALI-0001")
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == "MT-KALI-0001"
    assert isinstance(d.get("body"), str)
    assert len(d["body"]) > 100


def test_letters_daily_returns_letter():
    r = requests.get(f"{API}/letters/daily")
    assert r.status_code == 200
    d = r.json()
    assert d.get("id", "").startswith("MT-KALI-")
    assert d.get("body")
