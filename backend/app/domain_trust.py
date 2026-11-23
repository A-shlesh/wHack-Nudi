"""
Domain Trust Check: how much can we trust the WEBSITE itself?

Start at 100 points and take points off for each problem:
  - brand new website (under 30 days)          -50
  - young website (under 6 months)             -15
  - couldn't check the age                     -10
  - pretends to be a known brand               -65  (danger on its own)
  - no https on a page with a payment/login    -40   (no https elsewhere: -10)
Then: under 40 = "danger", 40 to 69 = "caution", 70 and up = "safe".

Demo pages run on localhost, which has no real domain to check. They can
pretend to be a website (domain + age) with two <meta> tags, read by the
extension. That is ONLY accepted when the page really is on localhost (or a
host listed in NUDI_DEMO_HOSTS), so a real scam site cannot use it.
"""

import os
from urllib.parse import urlparse

from .schemas import TrustReason, TrustRequest, TrustResponse
from .trust import age, https_check, lookalike
from .trust.domains import host_of, is_local, registrable_domain

NEW_DAYS = 30
YOUNG_DAYS = 180
DANGER_BELOW = 40
CAUTION_BELOW = 70
BRAND_PENALTY = 65  # pretending to be a bank or shop is serious enough on its own

# Extra hosts allowed to use demo tags, for example the AWS demo address.
_DEMO_HOSTS = {h.strip() for h in os.getenv("NUDI_DEMO_HOSTS", "").split(",") if h.strip()}


def level_for(score: int) -> str:
    if score < DANGER_BELOW:
        return "danger"
    if score < CAUTION_BELOW:
        return "caution"
    return "safe"


def _age_reasons(age_days: int | None) -> tuple[int, list[TrustReason]]:
    if age_days is None:
        return 10, [TrustReason(code="AGE_UNKNOWN", message_simple="I couldn't check how old this website is.")]
    if age_days < NEW_DAYS:
        return 50, [TrustReason(
            code="AGE_NEW",
            message_simple=f"This website was made only {age_days} days ago. Scam websites are often brand new.",
        )]
    if age_days < YOUNG_DAYS:
        return 15, [TrustReason(code="AGE_YOUNG", message_simple="This website is less than 6 months old.")]
    return 0, []


def _lookalike_reasons(domain: str, host: str) -> tuple[int, list[TrustReason], str | None]:
    result = lookalike.check(domain, host)
    if result.kind == "official":
        brand = result.brand["display"]
        return 0, [TrustReason(code="OFFICIAL_BRAND", message_simple=f"This is the official {brand} website.")], None
    if result.kind == "brand_in_name":
        brand, real = result.brand["display"], result.brand["official"][0]
        return BRAND_PENALTY, [TrustReason(
            code="BRAND_IN_NAME",
            message_simple=f"This website uses the name {brand}, but it is not the real {brand} website ({real}).",
        )], result.brand["official"][0]
    if result.kind == "near_miss":
        real = result.brand["official"][0]
        return BRAND_PENALTY, [TrustReason(
            code="NEAR_MISS",
            message_simple=f"This website name looks like {real} with a small change. Scammers do this to trick you.",
        )], real
    return 0, [], None


def check_trust(request: TrustRequest) -> TrustResponse:
    parts = urlparse(request.url)
    host = host_of(request.url)
    demo_allowed = (is_local(host) or host in _DEMO_HOSTS) and bool(request.demo_domain)

    # A local test page that is not pretending to be anything: nothing to check.
    if is_local(host) and not demo_allowed:
        return TrustResponse(
            domain=host, trust_score=100, level="safe", https=False, domain_age_days=None, lookalike_of=None,
            reasons=[TrustReason(code="LOCAL", message_simple="This is a test page on your own computer.")],
        )

    if demo_allowed:
        host = request.demo_domain.lower().removeprefix("www.")
        domain = registrable_domain(host)
        age_days = request.demo_age_days  # the demo says how old the pretend website is
        https = https_check.check("https", False, False)  # pretend websites are treated as https
    else:
        domain = registrable_domain(host)
        age_days = age.lookup_age_days(domain)
        https = https_check.check(parts.scheme, request.has_payment, request.has_login)

    age_penalty, reasons = _age_reasons(age_days)
    brand_penalty, brand_reasons, lookalike_of = _lookalike_reasons(domain, host)
    reasons += brand_reasons
    if https.code:
        reasons.append(TrustReason(code=https.code, message_simple=https.message))

    score = max(0, 100 - age_penalty - brand_penalty - https.penalty)
    return TrustResponse(
        domain=domain,
        trust_score=score,
        level=level_for(score),
        reasons=reasons,
        domain_age_days=age_days,
        lookalike_of=lookalike_of,
        https=https.https,
    )
