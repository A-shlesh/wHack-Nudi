# Tests for GET /family/{id}/digest: token rules, offline note, AI note and caching.

import pytest

from app import config, family
from app.services import llm
from app.storage import SQLiteStorage


@pytest.fixture(autouse=True)
def fresh(tmp_path):
    family.set_storage(SQLiteStorage(str(tmp_path / "t.db")))
    family.reset_rate_limit()
    family._digests.clear()


def paired(client):
    start = client.post("/family/pair/start", json={"elder_name": "Ajji"}).json()
    join = client.post("/family/pair/join", json={"code": start["code"], "family_name": "Sushant"}).json()
    elder = {"Authorization": f"Bearer {start['elder_token']}"}
    helper = {"Authorization": f"Bearer {join['family_token']}"}
    client.post("/family/pair/answer", json={"allow": True}, headers=elder)
    return start["family_id"], elder, helper


def turn_on_ai(monkeypatch):
    calls = []

    def fake(system, prompt, max_tokens, want_json):
        calls.append(prompt)
        return "Ajji had a calm week."

    monkeypatch.setitem(llm._PROVIDERS, "gemini", fake)
    monkeypatch.setattr(config, "ai_providers", lambda: ["gemini"])
    return calls


def test_digest_needs_the_family_token(client):
    family_id, elder, _ = paired(client)
    assert client.get(f"/family/{family_id}/digest").status_code == 401
    assert client.get(f"/family/{family_id}/digest", headers=elder).status_code == 401


def test_offline_digest_mentions_elder(client):
    family_id, elder, helper = paired(client)
    client.post("/events", json={"kind": "task_started"}, headers=elder)
    body = client.get(f"/family/{family_id}/digest", headers=helper).json()
    assert body["mode"] == "mock"
    assert "Ajji" in body["digest"]


def test_digest_uses_ai_text(client, monkeypatch):
    calls = turn_on_ai(monkeypatch)
    family_id, _, helper = paired(client)
    body = client.get(f"/family/{family_id}/digest", headers=helper).json()
    assert body == {"digest": "Ajji had a calm week.", "mode": "gemini"}
    assert len(calls) == 1


def test_digest_is_cached_until_a_new_event(client, monkeypatch):
    calls = turn_on_ai(monkeypatch)
    family_id, elder, helper = paired(client)
    url = f"/family/{family_id}/digest"
    client.get(url, headers=helper)
    client.get(url, headers=helper)
    assert len(calls) == 1
    client.post("/events", json={"kind": "task_started"}, headers=elder)
    client.get(url, headers=helper)
    assert len(calls) == 2
