"""Backend tests for new features: Gift a Letter + Weekly Digest Preview."""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# --- Weekly Digest Preview ---
def test_weekly_digest_preview_seven_letters():
    r = requests.get(f"{API}/letters/weekly-digest",
                     params={"weekday": 6, "tz": "America/New_York"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "start_date" in data and isinstance(data["start_date"], str)
    assert "letters" in data and isinstance(data["letters"], list)
    assert len(data["letters"]) == 7, f"expected 7 letters, got {len(data['letters'])}"
    for lt in data["letters"]:
        assert set(lt.keys()) >= {"id", "number", "title"}
        assert isinstance(lt["id"], str)
        assert isinstance(lt["number"], int)
        assert isinstance(lt["title"], str)


def test_weekly_digest_preview_no_params():
    r = requests.get(f"{API}/letters/weekly-digest", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert len(data["letters"]) == 7


def test_weekly_digest_changes_by_weekday():
    r1 = requests.get(f"{API}/letters/weekly-digest",
                      params={"weekday": 0, "tz": "America/New_York"}, timeout=20).json()
    r2 = requests.get(f"{API}/letters/weekly-digest",
                      params={"weekday": 3, "tz": "America/New_York"}, timeout=20).json()
    # start_date should differ (unless today happens to be same weekday; letters should still differ)
    ids1 = [l["id"] for l in r1["letters"]]
    ids2 = [l["id"] for l in r2["letters"]]
    assert ids1 != ids2 or r1["start_date"] != r2["start_date"]


# --- Gift a Letter ---
def test_gift_letter_success_gmail():
    unique = uuid.uuid4().hex[:8]
    payload = {
        "letter_id": "MT-KALI-0007",
        "to_email": f"kalitest+{unique}@gmail.com",
        "from_name": "A Seeker",
        "note": "Thinking of you",
    }
    r = requests.post(f"{API}/letters/gift", json=payload, timeout=30)
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:400]}"
    data = r.json()
    assert data.get("ok") is True


def test_gift_letter_not_found_404():
    payload = {
        "letter_id": "MT-KALI-9999",
        "to_email": "kalitest@gmail.com",
        "from_name": "A Seeker",
        "note": "n/a",
    }
    r = requests.post(f"{API}/letters/gift", json=payload, timeout=20)
    assert r.status_code == 404, f"expected 404, got {r.status_code} body={r.text[:400]}"


def test_gift_route_order_before_letter_id():
    """/letters/gift must not be captured by /letters/{letter_id}."""
    # If route order was wrong, POST /letters/gift would 405 or 404-as-letter.
    r = requests.post(f"{API}/letters/gift",
                      json={"letter_id": "MT-KALI-0007",
                            "to_email": "kalitest@gmail.com",
                            "from_name": "x", "note": "x"},
                      timeout=20)
    assert r.status_code in (200, 400, 422, 429), f"unexpected {r.status_code}"
