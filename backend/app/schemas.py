"""
The shapes of the data that the extension and the backend send to each other.
FastAPI uses these classes to check every request and response.
"""

from typing import Literal

from pydantic import BaseModel, Field

# Which AI answered. "ollama" runs on this computer; "mock" = Nudi's offline rules.
AiMode = Literal["ollama", "gemini", "groq", "bedrock", "mock"]


class PageElement(BaseModel):
    """One clickable thing on the page (button, link, or form field)."""

    id: str  # Nudi's own id, so the extension can find the element again
    kind: Literal["button", "link", "input", "select"]
    label: str = Field(max_length=200)


class PageSnapshot(BaseModel):
    """A cleaned-up summary of the page. Passwords, OTPs and card data are already removed."""

    url: str
    title: str = ""
    text: str = Field(default="", max_length=15000)  # visible text, shortened (Ask can search all of it)
    elements: list[PageElement] = Field(default_factory=list, max_length=150)


class Action(BaseModel):
    """One big button to show in the Action View."""

    element_id: str
    label: str  # simple words, e.g. "Pay the electricity bill"
    is_payment: bool = False  # if True, the extension MUST ask before clicking


class PageWarning(BaseModel):
    """A scam or dark-pattern warning to show the user."""

    level: Literal["info", "caution", "danger"]
    message: str
    source: Literal["rules", "ai"] = "rules"  # Nudi's own rules, or an extra AI warning


class Decision(BaseModel):
    """What Nudi should do about paying on this page. One of three, from mild to strict:
      watch       nothing worrying: the normal "Check before you pay" question
      ask_family  paying here needs a second person: Nudi suggests asking family first
      block       looks like a scam: Nudi blocks the payment (family can unlock it)
    Nudi's rules decide first; the AI can only make the decision STRICTER, never milder.
    """

    action: Literal["watch", "ask_family", "block"] = "watch"
    reasons: list[str] = Field(default_factory=list, max_length=3)
    source: Literal["rules", "ai"] = "rules"


class SimplifyResponse(BaseModel):
    summary: str  # one or two short sentences: "This page lets you ..."
    actions: list[Action]
    warnings: list[PageWarning]
    decision: Decision = Field(default_factory=Decision)
    mode: AiMode  # which AI answered ("mock" = offline rules)


class AskRequest(BaseModel):
    """A question the user typed or spoke about the current page."""

    question: str = Field(max_length=300)
    page: PageSnapshot


class AskResponse(BaseModel):
    answer: str
    mode: AiMode


class ExplainRequest(BaseModel):
    """Text the user selected on a page and asked Nudi to explain."""

    text: str = Field(min_length=1, max_length=500)
    page_title: str = Field(default="", max_length=200)


class ExplainResponse(BaseModel):
    explanation: str
    mode: AiMode


class SpeakRequest(BaseModel):
    text: str = Field(max_length=1000)
    language: str = "en"


# ---------- Domain trust check ----------


class TrustRequest(BaseModel):
    url: str
    has_payment: bool = False  # the page has a pay/buy button
    has_login: bool = False  # the page asks for a password
    # Only used for demo pages on localhost (see domain_trust.py).
    demo_domain: str | None = Field(default=None, max_length=253)
    demo_age_days: int | None = None


class TrustReason(BaseModel):
    code: str
    message_simple: str


class TrustResponse(BaseModel):
    domain: str
    trust_score: int = Field(ge=0, le=100)
    level: Literal["safe", "caution", "danger"]
    reasons: list[TrustReason]
    domain_age_days: int | None
    lookalike_of: str | None
    https: bool
