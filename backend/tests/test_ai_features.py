# Tests for the AI features (/simplify, /ask, /explain) through the API.
# A fake AI answers; it also remembers the prompt so we can check what it was sent.

import json

import pytest

from app import config
from app.services import llm

PAGE = {
    "url": "https://shop.example.com/cart",
    "title": "Cart",
    "text": "Your cart",
    "elements": [
        {"id": "e1", "kind": "button", "label": "Pay Now"},
        {"id": "e2", "kind": "link", "label": "Help"},
    ],
}


class FakeAI:
    def __init__(self, reply):
        self.reply, self.calls = reply, []

    def __call__(self, system, prompt, max_tokens, want_json):
        self.calls.append(prompt)
        return self.reply


@pytest.fixture
def ai(monkeypatch):
    """Turn the fake AI on. Usage: ai(reply) -> FakeAI"""

    def turn_on(reply):
        fake = FakeAI(reply)
        monkeypatch.setitem(llm._PROVIDERS, "gemini", fake)
        monkeypatch.setattr(config, "ai_providers", lambda: ["gemini"])
        return fake

    return turn_on


def reply(**data):
    base = {"summary": "A cart page.", "actions": [{"element_id": "e1", "label": "Pay Now", "is_payment": True}], "warnings": []}
    return json.dumps({**base, **data})


def test_simplify_uses_ai(client, ai):
    ai(reply())
    body = client.post("/simplify", json=PAGE).json()
    assert body["mode"] == "gemini"
    assert body["summary"] == "A cart page."


def test_unknown_element_ids_are_dropped(client, ai):
    ai(reply(actions=[
        {"element_id": "e2", "label": "Get help"},
        {"element_id": "made-up", "label": "Nope"},
    ]))
    ids = [a["element_id"] for a in client.post("/simplify", json=PAGE).json()["actions"]]
    assert ids == ["e2"]


def test_ai_warnings_are_marked_ai_and_capped_at_two(client, ai):
    ai(reply(warnings=[
        {"level": "danger", "message": "One"},
        {"level": "caution", "message": "Two"},
        {"level": "caution", "message": "Three"},
    ]))
    warnings = client.post("/simplify", json=PAGE).json()["warnings"]
    ai_ones = [w for w in warnings if w["source"] == "ai"]
    assert [w["message"] for w in ai_ones] == ["One", "Two"]


def test_invalid_warning_levels_are_ignored(client, ai):
    ai(reply(warnings=[{"level": "info", "message": "x"}, {"level": "banana", "message": "y"}, "text"]))
    warnings = client.post("/simplify", json=PAGE).json()["warnings"]
    assert [w for w in warnings if w["source"] == "ai"] == []


def test_rule_warnings_are_never_removed(client, ai):
    scam = {**PAGE, "text": "URGENT! Your KYC will expire today. Share your OTP now."}
    offline = client.post("/simplify", json=scam).json()["warnings"]
    assert offline  # Nudi's own rules fire
    ai(reply(warnings=[]))  # the AI says "nothing wrong"
    online = client.post("/simplify", json={**scam, "title": "Different"}).json()["warnings"]
    for warning in offline:
        assert warning in online


def test_bad_json_falls_back_to_mock(client, ai):
    ai("this is not json at all")
    assert client.post("/simplify", json=PAGE).json()["mode"] == "mock"


def test_ai_cannot_hide_a_payment(client, ai):
    ai(reply(actions=[{"element_id": "e1", "label": "Finish", "is_payment": False}]))
    action = client.post("/simplify", json=PAGE).json()["actions"][0]
    assert action["label"] == "Finish"
    assert action["is_payment"] is True


def test_same_page_twice_asks_ai_once(client, ai):
    fake = ai(reply())
    client.post("/simplify", json=PAGE)
    client.post("/simplify", json=PAGE)
    assert len(fake.calls) == 1


def test_ask_uses_ai_answer(client, ai):
    ai("It costs 500 rupees.")
    body = client.post("/ask", json={"question": "How much?", "page": PAGE}).json()
    assert body == {"answer": "It costs 500 rupees.", "mode": "gemini"}


def test_explain_uses_ai(client, ai):
    ai("It means checking who you are.")
    body = client.post("/explain", json={"text": "KYC", "page_title": "Bank"}).json()
    assert body == {"explanation": "It means checking who you are.", "mode": "gemini"}


def test_explain_offline_knows_kyc(client):
    body = client.post("/explain", json={"text": "Please complete KYC"}).json()
    assert body["mode"] == "mock"
    assert "Know Your Customer" in body["explanation"]


def test_explain_offline_fallback_sentence(client):
    body = client.post("/explain", json={"text": "zzz qqq"}).json()
    assert body["mode"] == "mock"
    assert "cannot explain this one" in body["explanation"]


def test_explain_rejects_empty_and_long_text(client):
    assert client.post("/explain", json={"text": ""}).status_code == 422
    assert client.post("/explain", json={"text": "a" * 501}).status_code == 422
    assert client.post("/explain", json={"text": "a" * 500}).status_code == 200


def test_private_numbers_are_hidden_before_reaching_ai(client, ai):
    fake = ai("ok")
    client.post("/explain", json={"text": "Your OTP 123456 and card 4111 1111 1111 1111"})
    prompt = fake.calls[0]
    assert "123456" not in prompt
    assert "4111" not in prompt
    assert "[hidden]" in prompt
