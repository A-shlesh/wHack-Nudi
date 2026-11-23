"""
Second safety net for private data.

The extension already removes passwords, OTPs and card fields before sending
anything. This file double-checks the text on the server and blanks out
anything that still looks like a card number, OTP, Aadhaar, PAN, bank account
or IFSC code. Nothing is ever written to disk.
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


def redact(text: str) -> str:
    """Return the text with private-looking data replaced by [hidden]."""
    for pattern in _PATTERNS:
        text = pattern.sub("[hidden]", text)
    return text


def safe_url(url: str) -> str:
    """Keep only scheme, host and path. Query strings and #fragments can hold tokens."""
    parts = urlparse(url)
    return f"{parts.scheme}://{parts.netloc}{parts.path}"
