# Family Link events: only whitelisted kinds, only while paired and sharing,
# nothing extra (such as a url) is stored, and the feed shows plain sentences.

import json

import pytest

from app import family
from app.storage import SQLiteStorage


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    family.set_storage(SQLiteStorage(str(tmp_path / "t.db")))
    family.reset_rate_limit()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def pair(client, allow=True):
    started = client.post("/family/pair/start", json={"elder_name": "Ajji"}).json()
    joined = client.post("/family/pair/join", json={"code": started["code"], "family_name": "Sushant"}).json()
    if allow:
        client.post("/family/pair/answer", json={"allow": True}, headers=bearer(started["elder_token"]))
    return bearer(started["elder_token"]), bearer(joined["family_token"]), started["family_id"]


def feed(client, family_headers, family_id):
    return client.get(f"/family/{family_id}/feed", headers=family_headers).json()


def test_events_rejected_before_pairing(client):
    elder, helper, fid = pair(client, allow=False)
    assert client.post("/events", json={"kind": "task_started"}, headers=elder).json() == {"stored": False}
    assert family.storage().list_events(fid) == []


def test_events_rejected_while_sharing_paused(client):
    elder, helper, fid = pair(client)
    client.post("/family/sharing", json={"on": False}, headers=elder)
    assert client.post("/events", json={"kind": "task_started"}, headers=elder).json() == {"stored": False}
    texts = [e["text"] for e in feed(client, helper, fid)["events"]]
    assert not any("started a task" in t for t in texts)
    assert any("paused sharing" in t for t in texts)

    client.post("/family/sharing", json={"on": True}, headers=elder)
    assert client.post("/events", json={"kind": "task_started"}, headers=elder).json() == {"stored": True}


def test_unknown_kind_is_422(client):
    elder, _, _ = pair(client)
    assert client.post("/events", json={"kind": "page_visited"}, headers=elder).status_code == 422
    assert client.post("/events", json={"kind": "warning_shown", "level": "scary"}, headers=elder).status_code == 422


def test_extra_fields_are_not_stored(client):
    elder, helper, fid = pair(client)
    client.post(
        "/events",
        json={
            "kind": "payment_confirmed",
            "amount": 500,
            "url": "https://bank.example/login?otp=123456",
            "page_text": "my card 4111",
            "typed": "hunter2",
        },
        headers=elder,
    )
    stored = json.dumps(family.storage().list_events(fid)) + json.dumps(feed(client, helper, fid))
    for leak in ("bank.example", "otp", "4111", "hunter2"):
        assert leak not in stored


def test_feed_shows_plain_sentences(client):
    elder, helper, fid = pair(client)
    client.post("/events", json={"kind": "task_started"}, headers=elder)
    client.post("/events", json={"kind": "warning_shown", "level": "danger"}, headers=elder)
    client.post("/events", json={"kind": "payment_confirmed", "amount": 1339}, headers=elder)
    client.post("/events", json={"kind": "payment_blocked", "amount": 2000}, headers=elder)
    texts = [e["text"] for e in feed(client, helper, fid)["events"]]
    assert "Ajji started a task with Nudi" in texts
    assert "Nudi warned Ajji about a possible scam" in texts
    assert "Ajji made a payment of ₹1,339 after checking" in texts
    assert "A payment of ₹2,000 was stopped" in texts


def test_weekly_summary_counts(client):
    elder, helper, fid = pair(client)
    for _ in range(2):
        client.post("/events", json={"kind": "task_started"}, headers=elder)
    client.post("/events", json={"kind": "addon_removed", "amount_saved": 300}, headers=elder)
    client.post("/events", json={"kind": "payment_blocked", "amount": 700}, headers=elder)
    assert feed(client, helper, fid)["summary"] == {"tasks_done": 2, "scams_blocked": 1, "money_saved": 1000}
