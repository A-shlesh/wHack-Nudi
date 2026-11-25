"""
MOCK version of the AI model.

Used when Bedrock credentials are missing. It builds a believable Action View
from the page with simple rules: it keeps the most useful-looking buttons and
rewrites their labels in plain words.
"""

from ..risk_rules import is_payment_label
from ..schemas import Action, PageElement, PageSnapshot

# Labels that are usually noise (or a trap) for an elderly user.
_SKIP_WORDS = [
    "cookie", "privacy", "terms", "newsletter", "advert", "sponsored", "share",
    "no, i don't", "no thanks",
]

_MAX_ACTIONS = 5
_ENOUGH_BUTTONS = 3


def _is_form_box(element: PageElement) -> bool:
    return element.kind in ("input", "select")


def _score(element: PageElement) -> float:
    """Higher score = more likely to be what the user came to do."""
    score = 0.0
    if _is_form_box(element):
        # A box to fill in (phone number, email) is often the main task, for
        # example on a login page. The site's search box is not.
        score += 0.5 if "search" in element.label.lower() else 2.5
    elif element.kind == "button":
        score += 2  # buttons do things; links are often just menus
    if is_payment_label(element.label):
        score += 3  # the main task on payment pages
    return score


def _friendly_label(element: PageElement) -> str:
    """Turn short or shouty labels into a calm phrase."""
    clean = " ".join(element.label.split()).strip()
    if clean.isupper():
        clean = clean.capitalize()
    if element.kind == "input":
        return f"Type your {clean.lower()}"
    if element.kind == "select":
        return f"Choose: {clean}"
    return clean


def simplify(page: PageSnapshot) -> tuple[str, list[Action]]:
    """Return (summary, actions) for the page without calling any AI service."""
    actions: list[Action] = []

    # If the page has enough real buttons, menu links are just noise: leave them out.
    button_count = sum(1 for e in page.elements if e.kind == "button")
    allowed_kinds = ("button", "input", "select") if button_count >= _ENOUGH_BUTTONS else ("button", "input", "select", "link")

    # Best candidates first. sorted() keeps page order when scores are equal.
    candidates = sorted(page.elements, key=_score, reverse=True)

    for element in candidates:
        label = element.label.strip()
        if not label or element.kind not in allowed_kinds:
            continue
        if not any(char.isalpha() for char in label):
            continue  # "+91", "→", "x": not something to offer
        if "search" in label.lower():
            continue  # the site's search box and search button are not the task
        if any(word in label.lower() for word in _SKIP_WORDS):
            continue

        actions.append(
            Action(
                element_id=element.id,
                label=_friendly_label(element),
                is_payment=is_payment_label(label),
            )
        )
        if len(actions) >= _MAX_ACTIONS:
            break

    title = page.title or "this website"
    summary = f"You are on {title}. Here are the main things you can do."
    return summary, actions
