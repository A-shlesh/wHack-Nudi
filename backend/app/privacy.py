"""
Second safety net for private data.

The extension already removes passwords, OTPs and card fields before sending
anything. This file double-checks the text on the server and blanks out
anything that still looks like a card number, OTP, Aadhaar, PAN, bank account
or IFSC code. Nothing is ever written to disk.

Phone and helpline numbers (mobile, landline, toll-free) are public contact
details on a page, so they are kept; that way the assistant can answer "what is
the helpline number?". A number written next to words like account, card, OTP
or Aadhaar is still hidden.
"""

import re
from urllib.parse import urlparse

# Each pattern finds one kind of private data in free text.
# The same patterns live in extension/src/lib/sanitize.ts; keep them in sync.
_PATTERNS = [
    # Card numbers: 13-19 digits, maybe split by spaces or dashes.
    re.compile(r"\b(?:\d[ -]?){13,19}\b"),
    # Aadhaar written as 1234 5678 9012.
    re.compile(r"\b\d{4}[ -]\d{4}[ -]\d{4}\b"),
    # Indian bank IFSC codes, e.g. SBIN0001234.
    re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"),
    # PAN card numbers, e.g. ABCDE1234F.
    re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),
    # Long digit runs (bank account numbers, Aadhaar): 9 or more digits.
    re.compile(r"\b\d{9,}\b"),
    # A code AFTER a keyword: "OTP: 1234", "Your OTP is 481516", "PIN code 4321".
    re.compile(r"\b(?:otp|cvv|pin|passcode)\b[^\d\n]{0,20}\d{3,8}", re.IGNORECASE),
    # A code BEFORE the keyword: "481516 is your OTP".
    re.compile(r"\b\d{4,8}\b(?=[^\d\n]{0,20}\b(?:otp|one[- ]time)\b)", re.IGNORECASE),
    # "password: secret123"
    re.compile(r"\bpassword\s*[:=]\s*\S+", re.IGNORECASE),
]

# Phone numbers are kept. Each match must not touch other digits, so it can
# never be a slice of a longer card, Aadhaar or account number.
_PHONE = re.compile(
    r"(?<!\d)(?<!\d[ -])(?:"
    # Indian mobile, e.g. +91 94823 00400, 9482300400, 08277799990.
    r"(?:\+91[ -]?|91 |0)?[6-9]\d{4}[ -]?\d{5}"
    # Landline with STD code, e.g. 080 22261702.
    r"|0\d{2,4}[ -]\d{6,8}"
    # Toll-free, e.g. 1800 425 1234.
    r"|1800[ -]?\d{3}[ -]?\d{4}"
    r")(?![ -]?\d)"
)
# A number written right after one of these words is private, not a phone.
_PRIVATE_WORD = re.compile(
    r"(?<!\w)(?:account|a/c|acct|card|aadhaar|aadhar|otp|pin|cvv|ifsc|upi|pan|password)(?!\w)",
    re.IGNORECASE,
)
_LOOKBACK = 25


def _token(index: int) -> str:
    # Letters only (a-j), so no pattern above can match the placeholder.
    return chr(0xE000) + "".join(chr(97 + int(d)) for d in str(index)) + chr(0xE001)


def redact(text: str) -> str:
    """Return the text with private-looking data replaced by [hidden]."""
    kept: list[str] = []

    def protect(match: re.Match) -> str:
        before = text[max(0, match.start() - _LOOKBACK):match.start()]
        if _PRIVATE_WORD.search(before):
            return match.group(0)
        kept.append(match.group(0))
        return _token(len(kept) - 1)

    text = _PHONE.sub(protect, text)
    for pattern in _PATTERNS:
        text = pattern.sub("[hidden]", text)
    for i, original in enumerate(kept):
        text = text.replace(_token(i), original)
    return text


def safe_url(url: str) -> str:
    """Keep only scheme, host and path. Query strings and #fragments can hold tokens."""
    parts = urlparse(url)
    return f"{parts.scheme}://{parts.netloc}{parts.path}"
