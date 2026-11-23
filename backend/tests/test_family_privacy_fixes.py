# Tests for the Family Link privacy fixes: strict site names and amounts,
# reasons written by the server, and real unpairing.

import pytest

from app import family
from app.storage import SQLiteStorage


@pytest.fixture(autouse=True)
def fresh_storage(tmp_path):
    family.set_storage(SQLiteStorage(str(tmp_path / "t.db")))
    family.reset_rate_limit()


def paired(client):
    """Start, join and allow. Returns (family_id, elder_headers, family_headers)."""
    start = client.post("/family/pair/start", json={"elder_name": "Ajji"}).json()
    join = client.post("/family/pair/join", json={"code": start["code"], "family_name": "Sushant"}).json()
    elder = {"Authorization": f"Bearer {start['elder_token']}"}
    helper = {"Authorization": f"Bearer {join['family_token']}"}
    client.post("/family/pair/answer", json={"allow": True}, headers=elder)
    return start["family_id"], elder, helper


def test_site_with_query_or_password_is_cut_to_the_host(client):
    family_id, elder, helper = paired(client)
    body = {"site": "user:pw@bescom-bill-pay-offer.co/pay?otp=1234#x", "amount": "₹1,275", "age_days": 9}
    assert client.post("/approvals", json=body, headers=elder).status_code == 200
    pending = client.get(f"/family/{family_id}/feed", headers=helper).json()["pending"][0]
    assert pending["site"] == "bescom-bill-pay-offer.co"
    assert "1234" not in str(pending)


def test_amount_must_look_like_money(client):
    _, elder, _ = paired(client)
    body = {"site": "shop.example.com", "amount": "my password is hunter2"}
    assert client.post("/approvals", json=body, headers=elder).status_code == 422


def test_reasons_come_from_the_server_not_the_client(client):
    family_id, elder, helper = paired(client)
    body = {"site": "bescom-bill-pay-offer.co", "amount": "₹1,275", "age_days": 9, "reasons": ["page text: OTP 4321"]}
    client.post("/approvals", json=body, headers=elder)
    reasons = client.get(f"/family/{family_id}/feed", headers=helper).json()["pending"][0]["reasons"]
    assert any("9 days" in r for r in reasons)
    assert any("BESCOM" in r for r in reasons)
    assert not any("4321" in r for r in reasons)


def test_unpair_stops_the_family_token(client):
    family_id, elder, helper = paired(client)
    assert client.post("/family/unpair", headers=elder).status_code == 200
    assert client.get(f"/family/{family_id}/feed", headers=helper).status_code == 401
