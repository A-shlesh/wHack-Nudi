"""
The shapes of the data that the extension and the backend send to each other.
FastAPI uses these classes to check every request and response.
"""

from typing import Literal

from pydantic import BaseModel, Field


class PageElement(BaseModel):
    """One clickable thing on the page (button, link, or form field)."""

    id: str  # Nudi's own id, so the extension can find the element again
    kind: Literal["button", "link", "input", "select"]
    label: str = Field(max_length=200)


class PageSnapshot(BaseModel):
    """A cleaned-up summary of the page. Passwords, OTPs and card data are already removed."""

    url: str
    title: str = ""
    text: str = Field(default="", max_length=6000)  # visible text, shortened
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


class SimplifyResponse(BaseModel):
    summary: str  # one or two short sentences: "This page lets you ..."
    actions: list[Action]
    warnings: list[PageWarning]
    mode: Literal["bedrock", "mock"]  # shows whether real AI was used


class SpeakRequest(BaseModel):
    text: str = Field(max_length=1000)
    language: str = "en"
