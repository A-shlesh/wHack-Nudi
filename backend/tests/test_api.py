# Tests for the HTTP API (mock mode only; no real AWS or ElevenLabs calls).

from app import config
from app.services import llm


def el(id, kind, label):
    return {"id": id, "kind": kind, "label": label}


def simplify(client, elements, text="", url="https://shop.example.com"):
    body = {"url": url, "title": "Test", "text": text, "elements": elements}
    return client.post("/simplify", json=body)


def test_health_reports_mock_mode(client):
    data = client.get("/health").json()
    assert data == {"status": "ok", "ai": "mock", "ai_backups": [], "voice": "browser"}


def test_simplify_flags_payment_action(client):
    data = simplify(client, [el("1", "button", "Pay Rs 1,240")]).json()
    assert data["mode"] == "mock"
    assert data["actions"][0]["is_payment"] is True


def test_simplify_skips_cookie_and_newsletter_links(client):
    elements = [
        el("1", "link", "Accept cookies"),
        el("2", "link", "Newsletter signup"),
        el("3", "link", "My orders"),
    ]
    ids = [a["element_id"] for a in simplify(client, elements).json()["actions"]]
    assert ids == ["3"]


def test_simplify_ranks_buttons_before_nav_links(client):
    elements = [el("1", "link", "Home"), el("2", "button", "Continue")]
    ids = [a["element_id"] for a in simplify(client, elements).json()["actions"]]
    assert ids == ["2", "1"]


def test_simplify_redacts_private_numbers_in_labels(client):
    elements = [el("1", "button", "Pay from account 123456789012")]
    label = simplify(client, elements).json()["actions"][0]["label"]
    assert "123456789012" not in label


def test_simplify_returns_at_most_five_actions(client):
    elements = [el(str(i), "button", f"Option {i}") for i in range(12)]
    assert len(simplify(client, elements).json()["actions"]) == 5


def test_simplify_includes_warnings(client):
    data = simplify(client, [], text="You have won a lottery").json()
    assert any(w["level"] == "danger" for w in data["warnings"])


def test_simplify_falls_back_to_mock_when_every_ai_fails(client, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("AI is down")

    # Pretend Gemini is set up, but every call to it fails.
    monkeypatch.setattr(config, "ai_providers", lambda: ["gemini"])
    monkeypatch.setitem(llm._PROVIDERS, "gemini", broken)
    response = simplify(client, [el("1", "button", "Continue")])
    assert response.status_code == 200
    assert response.json()["mode"] == "mock"


def test_speak_returns_204_in_mock_mode(client):
    response = client.post("/speak", json={"text": "Hello"})
    assert response.status_code == 204


def test_demo_page_is_served(client):
    assert client.get("/demo/").status_code == 200


def test_renamed_payment_button_is_still_a_payment(client, monkeypatch):
    # Even if the AI renames "Pay ₹5000" to "Finish", the original label marks it as a payment.
    reply = '{"summary": "Summary", "actions": [{"element_id": "b1", "label": "Finish", "is_payment": false}]}'
    monkeypatch.setattr(config, "ai_providers", lambda: ["gemini"])
    monkeypatch.setitem(llm._PROVIDERS, "gemini", lambda *args: reply)
    body = {
        "url": "https://shop.example.com",
        "elements": [{"id": "b1", "kind": "button", "label": "Pay ₹5000"}],
    }
    action = client.post("/simplify", json=body).json()["actions"][0]
    assert action["is_payment"] is True
