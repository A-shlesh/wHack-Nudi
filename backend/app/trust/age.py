"""
Domain age check, using RDAP (the modern, free replacement for WHOIS).

https://rdap.org/domain/<domain> redirects to the official registry for that
domain ending, which returns JSON. The registration date is the event with
eventAction "registration".

Rules:
  - If the lookup fails in ANY way, return None ("couldn't check"). Never guess.
  - Results (including failures) are cached in memory for 10 minutes per domain,
    so we do not ask rdap.org again on every page (it allows ~10 requests / 10 s).

Privacy: only the domain name is sent to rdap.org, never the full address.
"""

import time
from datetime import datetime, timezone

import httpx

_RDAP_URL = "https://rdap.org/domain/{domain}"
_TIMEOUT_SECONDS = 5
CACHE_SECONDS = 10 * 60

# domain -> (time saved, age in days or None)
_cache: dict[str, tuple[float, int | None]] = {}


def clear_cache() -> None:
    _cache.clear()


def _registration_date(rdap_json: dict) -> datetime | None:
    for event in rdap_json.get("events", []):
        if event.get("eventAction") == "registration" and event.get("eventDate"):
            # Dates look like "2024-11-14T08:12:00Z".
            return datetime.fromisoformat(event["eventDate"].replace("Z", "+00:00"))
    return None


def lookup_age_days(domain: str) -> int | None:
    """Days since the domain was registered, or None if we could not find out."""
    now = time.time()
    if domain in _cache and now - _cache[domain][0] < CACHE_SECONDS:
        return _cache[domain][1]

    age: int | None = None
    try:
        response = httpx.get(
            _RDAP_URL.format(domain=domain),
            headers={"Accept": "application/rdap+json"},
            follow_redirects=True,
            timeout=_TIMEOUT_SECONDS,
        )
        if response.status_code == 200:
            registered = _registration_date(response.json())
            if registered:
                age = max(0, (datetime.now(timezone.utc) - registered).days)
    except (httpx.HTTPError, ValueError):
        age = None  # network problem or bad JSON: "couldn't check"

    _cache[domain] = (now, age)
    return age
