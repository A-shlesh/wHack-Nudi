"""
Second safety net for private data.

The extension already removes passwords, OTPs and card fields before sending
anything. This file double-checks the text on the server and blanks out
anything that still looks like a card number, OTP, bank account or IFSC code.
Nothing is ever written to disk.
"""

import re

# Each pattern finds one kind of private number in free text.
_PATTERNS = [
    # Card numbers: 13-19 digits, maybe split by spaces or dashes.
    re.compile(r"\b(?:\d[ -]?){13,19}\b"),
    # Indian bank IFSC codes, e.g. SBIN0001234.
    re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"),
    # Long digit runs (bank account numbers, Aadhaar): 9 or more digits.
    re.compile(r"\b\d{9,}\b"),
    # "OTP 123456", "otp: 1234", "CVV 123" and similar.
    re.compile(r"\b(?:otp|cvv|pin|password)\s*[:=-]?\s*\S+", re.IGNORECASE),
]


def redact(text: str) -> str:
    """Return the text with private-looking numbers replaced by [hidden]."""
    for pattern in _PATTERNS:
        text = pattern.sub("[hidden]", text)
    return text
