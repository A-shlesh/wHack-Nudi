# Tests for the domain age lookup. httpx.get is faked, so no network is used.
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.trust import age


class FakeResponse:
    def __init__(self, status_code=200, data=None, bad_json=False):
        self.status_code = status_code
        self._data = data
        self._bad_json = bad_json

    def json(self):
        if self._bad_json:
            raise ValueError("not json")
        return self._data


def rdap_registered_days_ago(days):
    when = datetime.now(timezone.utc) - timedelta(days=days, hours=1)
    return {"events": [{"eventAction": "registration", "eventDate": when.strftime("%Y-%m-%dT%H:%M:%SZ")}]}


@pytest.fixture(autouse=True)
def fresh_cache():
    age.clear_cache()
    yield
    age.clear_cache()


def fake_get(monkeypatch, response=None, error=None):
    calls = []

    def get(*args, **kwargs):
        calls.append(args)
        if error:
            raise error
        return response

    monkeypatch.setattr(age.httpx, "get", get)
    return calls


def test_registration_nine_days_ago(monkeypatch):
    fake_get(monkeypatch, FakeResponse(data=rdap_registered_days_ago(9)))
    assert age.lookup_age_days("a.com") == 9


def test_no_registration_event(monkeypatch):
    data = {"events": [{"eventAction": "expiration", "eventDate": "2030-01-01T00:00:00Z"}]}
    fake_get(monkeypatch, FakeResponse(data=data))
    assert age.lookup_age_days("a.com") is None


def test_http_404(monkeypatch):
    fake_get(monkeypatch, FakeResponse(status_code=404))
    assert age.lookup_age_days("a.com") is None


def test_connect_error_does_not_crash(monkeypatch):
    fake_get(monkeypatch, error=httpx.ConnectError("no network"))
    assert age.lookup_age_days("a.com") is None


def test_bad_json(monkeypatch):
    fake_get(monkeypatch, FakeResponse(bad_json=True))
    assert age.lookup_age_days("a.com") is None


def test_second_call_uses_cache(monkeypatch):
    calls = fake_get(monkeypatch, FakeResponse(data=rdap_registered_days_ago(9)))
    assert age.lookup_age_days("a.com") == 9
    assert age.lookup_age_days("a.com") == 9
    assert len(calls) == 1


def test_cache_expires(monkeypatch):
    calls = fake_get(monkeypatch, FakeResponse(data=rdap_registered_days_ago(9)))
    now = [1000.0]
    monkeypatch.setattr(age.time, "time", lambda: now[0])
    age.lookup_age_days("a.com")
    now[0] += age.CACHE_SECONDS + 1
    age.lookup_age_days("a.com")
    assert len(calls) == 2
