# Family Link pairing and tokens: the elder must allow, codes are single-use,
# expire after 10 minutes, wrong guesses are limited, and each token only
# works for its own role.

import pytest

from app import family
from app.storage import SQLiteStorage


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    family.set_storage(SQLiteStorage(str(tmp_path / "t.db")))
    family.reset_rate_limit()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def start_and_join(client):
    started = client.post("/family/pair/start", json={"elder_name": "Ajji"}).json()
    joined = client.post("/family/pair/join", json={"code": started["code"], "family_name": "Sushant"}).json()
    return started, joined


def test_full_pairing_flow_allow(client):
    started, joined = start_and_join(client)
    elder = bearer(started["elder_token"])
    status = client.get("/family/pair/status", headers=elder).json()
    assert status["status"] == "request"
    assert status["family_name"] == "Sushant"

    assert client.post("/family/pair/answer", json={"allow": True}, headers=elder).json() == {"status": "paired"}
    assert client.get("/family/pair/status", headers=elder).json()["status"] == "paired"


def test_deny_means_rejected_and_family_token_dies(client):
    started, joined = start_and_join(client)
    elder = bearer(started["elder_token"])
    client.post("/family/pair/answer", json={"allow": False}, headers=elder)
    assert client.get("/family/pair/status", headers=elder).json()["status"] == "rejected"
    feed = client.get(f"/family/{joined['family_id']}/feed", headers=bearer(joined["family_token"]))
    assert feed.status_code == 401


def test_nothing_in_feed_before_allow(client):
    started, joined = start_and_join(client)
    feed = client.get(f"/family/{joined['family_id']}/feed", headers=bearer(joined["family_token"])).json()
    assert feed["status"] == "request"
    assert feed["events"] == []


def test_code_works_only_once(client):
    started = client.post("/family/pair/start", json={}).json()
    body = {"code": started["code"]}
    assert client.post("/family/pair/join", json=body).status_code == 200
    assert client.post("/family/pair/join", json=body).status_code == 404


def test_expired_code_is_404(client, monkeypatch):
    started = client.post("/family/pair/start", json={}).json()
    real_now = family._now()
    monkeypatch.setattr(family, "_now", lambda: real_now + family.CODE_SECONDS + 1)
    assert client.post("/family/pair/join", json={"code": started["code"]}).status_code == 404


def test_wrong_codes_are_rate_limited(client):
    for _ in range(family.MAX_JOIN_TRIES):
        assert client.post("/family/pair/join", json={"code": "000000"}).status_code == 404
    assert client.post("/family/pair/join", json={"code": "000000"}).status_code == 429


def test_missing_or_bad_token_is_401(client):
    assert client.get("/family/pair/status").status_code == 401
    assert client.get("/family/pair/status", headers=bearer("nonsense")).status_code == 401
    assert client.get("/family/pair/status", headers=bearer("abc.elder.wrong")).status_code == 401


def test_elder_token_cannot_read_feed_and_family_token_cannot_post_events(client):
    started, joined = start_and_join(client)
    client.post("/family/pair/answer", json={"allow": True}, headers=bearer(started["elder_token"]))

    feed_url = f"/family/{started['family_id']}/feed"
    assert client.get(feed_url, headers=bearer(started["elder_token"])).status_code == 401
    assert client.get(feed_url, headers=bearer(joined["family_token"])).status_code == 200

    event = {"kind": "task_started"}
    assert client.post("/events", json=event, headers=bearer(joined["family_token"])).status_code == 401
    assert client.post("/events", json=event, headers=bearer(started["elder_token"])).status_code == 200


def test_family_token_cannot_see_another_family(client):
    _, joined = start_and_join(client)
    other, _ = start_and_join(client)
    r = client.get(f"/family/{other['family_id']}/feed", headers=bearer(joined["family_token"]))
    assert r.status_code == 403
