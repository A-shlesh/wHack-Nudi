"""
Simple, rule-based checks for scams and dark patterns.

These rules always run, even when the AI model is off, so the user is
protected in every mode. Each rule is a list of phrases plus the warning to
show when one of those phrases appears on the page.
"""

from urllib.parse import urlparse

from .schemas import PageSnapshot, PageWarning

# (phrases to look for, warning level, message shown to the user)
_TEXT_RULES = [
    (
        ["hurry", "only a few left", "offer ends in", "expires in", "last chance", "act now"],
        "caution",
        "This page is rushing you. Take your time. Real offers do not disappear in minutes.",
    ),
    (
        ["you have won", "lottery", "lucky winner", "claim your prize", "free gift"],
        "danger",
        "This looks like a prize scam. You cannot win something you did not enter.",
    ),
    (
        ["kyc", "account will be blocked", "account suspended", "verify your account immediately"],
        "danger",
        "Banks never ask you to update KYC through a link. Call your bank on its official number.",
    ),
    (
        ["share otp", "tell us the otp", "enter otp to receive"],
        "danger",
        "Never share an OTP to RECEIVE money. An OTP is only for sending money.",
    ),
    (
        ["remote access", "anydesk", "teamviewer", "quick support"],
        "danger",
        "Never install screen-sharing apps because a website or caller tells you to.",
    ),
    (
        ["protection plan added", "insurance added", "donation added", "tip added"],
        "caution",
        "Something extra may have been added to your order. Check the total before paying.",
    ),
    (
        ["no, i don't want to save", "no thanks, i prefer paying more"],
        "info",
        "This page uses guilt words to push you. It is fine to say no.",
    ),
]

# Words that mean a button will spend money. Used to force a confirmation.
PAYMENT_WORDS = [
    "pay", "buy", "checkout", "check out", "place order", "purchase",
    "subscribe", "donate", "transfer", "send money", "confirm order", "proceed to payment",
]


def is_payment_label(label: str) -> bool:
    """True if a button label sounds like it will spend money."""
    lowered = label.lower()
    return any(word in lowered for word in PAYMENT_WORDS)


def check_page(page: PageSnapshot) -> list[PageWarning]:
    """Return every warning that matches this page."""
    warnings: list[PageWarning] = []
    text = f"{page.title} {page.text}".lower()

    for phrases, level, message in _TEXT_RULES:
        if any(phrase in text for phrase in phrases):
            warnings.append(PageWarning(level=level, message=message))

    # A page without https is not safe for payments.
    if urlparse(page.url).scheme == "http" and "localhost" not in page.url:
        warnings.append(
            PageWarning(level="danger", message="This website is not secure (no https). Do not pay here.")
        )

    return warnings
