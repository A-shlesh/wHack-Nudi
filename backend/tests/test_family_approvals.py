# Family Link approvals: only domain, amount and trust reasons are shared;
# only the family token can decide; the voice note works in mock mode.

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


def ask(client, elder, **overrides):
    body = {"site": "shop.example.com", "amount": "₹1,339", "reasons": ["This website is new."], "age_days": 20}
    body.update(overrides)
    return client.post("/approvals", json=body, headers=elder)


def test_create_needs_paired_and_sharing(client):
    elder, _, _ = pair(client, allow=False)
    assert ask(client, elder).status_code == 409

    elder, _, _ = pair(client)
    client.post("/family/sharing", json={"on": False}, headers=elder)
    assert ask(client, elder).status_code == 409
    client.post("/family/sharing", json={"on": True}, headers=elder)
    assert ask(client, elder).status_code == 200


def test_full_url_is_stored_as_domain_only(client):
    elder, helper, fid = pair(client)
    ask(client, elder, site="https://www.Pay-Now.example.com/checkout/step2?card=4111&otp=998877#x")
    pending = client.get(f"/family/{fid}/feed", headers=helper).json()["pending"]
    assert pending[0]["site"] == "pay-now.example.com"
    assert "checkout" not in str(pending) and "4111" not in str(pending) and "998877" not in str(pending)


def test_elder_polls_family_blocks(client):
    elder, helper, fid = pair(client)
    approval_id = ask(client, elder).json()["approval_id"]
    assert client.get(f"/approvals/{approval_id}", headers=elder).json() == {"status": "pending"}

    pending = client.get(f"/family/{fid}/feed", headers=helper).json()["pending"]
    assert [p["id"] for p in pending] == [approval_id]

    r = client.post(f"/approvals/{approval_id}/decision", json={"decision": "blocked"}, headers=helper)
    assert r.json() == {"status": "blocked"}
    assert client.get(f"/approvals/{approval_id}", headers=elder).json() == {"status": "blocked"}
    assert client.get(f"/family/{fid}/feed", headers=helper).json()["pending"] == []


def test_elder_token_cannot_decide(client):
    elder, _, _ = pair(client)
    approval_id = ask(client, elder).json()["approval_id"]
    r = client.post(f"/approvals/{approval_id}/decision", json={"decision": "approved"}, headers=elder)
    assert r.status_code == 401
    assert client.get(f"/approvals/{approval_id}", headers=elder).json() == {"status": "pending"}


def test_deciding_twice_is_409(client):
    elder, helper, _ = pair(client)
    approval_id = ask(client, elder).json()["approval_id"]
    url = f"/approvals/{approval_id}/decision"
    assert client.post(url, json={"decision": "approved"}, headers=helper).status_code == 200
    assert client.post(url, json={"decision": "blocked"}, headers=helper).status_code == 409


def test_voice_is_204_in_mock_mode(client):
    elder, helper, _ = pair(client)
    approval_id = ask(client, elder).json()["approval_id"]
    assert client.get(f"/approvals/{approval_id}/voice", headers=helper).status_code == 204
    assert client.get(f"/approvals/{approval_id}/voice", headers=elder).status_code == 401


def test_voice_note_text_mentions_age_only_when_young():
    young = family.voice_note_text("Ajji", "₹500", "shop.example.com", 20)
    assert "20 days ago" in young and "Rs 500" in young
    assert "days ago" not in family.voice_note_text("Ajji", "₹500", "shop.example.com", 4000)
    assert "days ago" not in family.voice_note_text("Ajji", None, "shop.example.com", None)
