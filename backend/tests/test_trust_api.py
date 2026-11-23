# Tests for POST /trust. The age lookup is faked, so no network is used.
from app.trust import age

KEYS = {"domain", "trust_score", "level", "reasons", "domain_age_days", "lookalike_of", "https"}


def post(client, monkeypatch, body, age_days=None):
    monkeypatch.setattr(age, "lookup_age_days", lambda domain: age_days)
    response = client.post("/trust", json=body)
    assert response.status_code == 200
    return response.json()


def codes(data):
    return [r["code"] for r in data["reasons"]]


def test_demo_scam_is_danger(client, monkeypatch):
    data = post(client, monkeypatch, {
        "url": "http://localhost:8787/demo/bescom-scam.html",
        "demo_domain": "bescom-bill-pay-offer.co",
        "demo_age_days": 9,
    })
    assert data["level"] == "danger"
    assert data["lookalike_of"] == "bescom.co.in"
    assert data["domain_age_days"] == 9


def test_demo_bill_page_is_safe(client, monkeypatch):
    data = post(client, monkeypatch, {
        "url": "http://localhost:8787/demo/bill.html",
        "demo_domain": "powergrid-bills.in",
        "demo_age_days": 4200,
    })
    assert data["level"] == "safe"


def test_demo_tags_ignored_on_real_site(client, monkeypatch):
    data = post(client, monkeypatch, {
        "url": "https://evil.example/pay",
        "demo_domain": "sbi.co.in",
        "demo_age_days": 9999,
    }, age_days=3)
    assert data["domain"] == "evil.example"
    assert data["domain_age_days"] == 3
    assert data["lookalike_of"] is None


def test_localhost_without_demo_tags(client, monkeypatch):
    data = post(client, monkeypatch, {"url": "http://localhost:8787/demo/anything.html"})
    assert "LOCAL" in codes(data)
    assert data["level"] == "safe"


def test_unknown_age_does_not_crash(client, monkeypatch):
    data = post(client, monkeypatch, {"url": "https://example.com"}, age_days=None)
    assert "AGE_UNKNOWN" in codes(data)
    assert data["domain_age_days"] is None


def test_response_shape_and_score_range(client, monkeypatch):
    bodies = [
        {"url": "https://example.com"},
        {"url": "http://sbi-online-pay.co/login", "has_login": True},
        {"url": "http://localhost:8787/x"},
        {"url": "http://localhost:8787/x", "demo_domain": "bescom-bill-pay-offer.co", "demo_age_days": 1, "has_payment": True},
    ]
    for body in bodies:
        data = post(client, monkeypatch, body, age_days=2)
        assert set(data) == KEYS
        assert 0 <= data["trust_score"] <= 100
        for reason in data["reasons"]:
            assert set(reason) == {"code", "message_simple"}
