"""
Nudi's AI features. Each one asks the AI (through llm.py) and, if no AI is
available, uses Nudi's offline rules instead.

  simplify()       page -> short summary, up to 5 big choices, extra scam warnings,
                   and one structured decision: watch / ask_family / block
  answer()         a question about the page -> a short plain answer
  explain()        a confusing word or sentence -> a simple explanation
  weekly_digest()  Family Link numbers -> a warm weekly note for the family

Human-in-the-loop rule: the AI may only ADD things (a warning, a summary,
an explanation, a STRICTER decision). It can never approve a payment, never
mark something as "not a payment", never remove a warning from Nudi's own
rules, and never make Nudi's decision milder.

Structured output: every AI reply is checked against a Pydantic model
(AiDecision below). A reply that does not fit is thrown away, never guessed at.
"""

import hashlib
import json
import re
import time

from pydantic import BaseModel, Field, ValidationError

from ..schemas import Action, Decision, PageSnapshot, PageWarning
from . import llm, mock_ai, mock_answers

PLAIN_WORDS = "Use short sentences and words a 75-year-old would understand. Plain text, no markdown."

# ---------------------------------------------------------------------------
# Page help
# ---------------------------------------------------------------------------

_SIMPLIFY_SYSTEM = f"""You help elderly and low-tech users use websites safely.
You get a list of page elements (id | kind | label) and some page text.
Reply with ONLY a JSON object in this shape:
{{"summary": "<one short sentence: what this page is for>",
 "actions": [{{"element_id": "<id from the list>", "label": "<short, plain words>", "is_payment": <true|false>}}],
 "warnings": [{{"level": "caution" or "danger", "message": "<one short sentence>"}}],
 "decision": {{"action": "watch" or "ask_family" or "block", "reasons": ["<one short sentence>"]}}}}
Rules:
- At most 5 actions, the most important first. Only ids from the list. Skip ads, cookies, newsletters, social links.
- is_payment is true for anything that spends money.
- warnings: only real scam or pressure signs you see in the page text (fake urgency, prizes, KYC threats,
  requests for OTP, remote-access apps, hidden extra charges). At most 2. Empty list if none.
- decision: what to do if the user tries to PAY on this page.
  "watch" = nothing worrying (use this for most pages).
  "ask_family" = paying here is risky enough that a family member should check first
  (pressure to pay now, an unusual way to pay, a seller you cannot identify).
  "block" = clearly a scam (asks for an OTP or PIN to receive money, a remote-access app,
  a prize you never entered, a KYC or account-blocked threat).
  reasons: 1 to 3 short sentences, empty for "watch".
- {PLAIN_WORDS}"""

# Same page within 5 minutes: reuse the answer (saves the free AI quota).
_CACHE_SECONDS = 5 * 60
_simplify_cache: dict[str, tuple[float, tuple]] = {}


def _page_prompt(page: PageSnapshot, text_limit: int = 3000) -> str:
    elements = "\n".join(f"{e.id} | {e.kind} | {e.label}" for e in page.elements)
    return f"Title: {page.title}\nURL: {page.url}\n\nElements:\n{elements}\n\nPage text:\n{page.text[:text_limit]}"


# ---------------------------------------------------------------------------
# Finding the part of a long page that answers a question
# ---------------------------------------------------------------------------

_WINDOW = 300  # characters per piece of page text
_STEP = 250  # pieces overlap a little, so a phone number is never cut in half
_MAX_RELEVANT = 1500
_STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "what", "which", "who", "how", "when", "where", "why",
    "do", "does", "i", "my", "me", "for", "of", "to", "in", "on", "this", "that", "it", "can",
    "page", "please", "tell", "there", "and", "or", "with", "you", "your",
}
# A question's word also finds pages that use other words for the same thing.
_SAME_AS = {
    "phone": ["helpline", "call", "contact", "mobile", "landline", "number", "whatsapp", "tel"],
    "number": ["helpline", "phone", "contact", "mobile", "landline"],
    "helpline": ["phone", "call", "contact", "number"],
    "contact": ["phone", "helpline", "email", "mail", "address"],
    "email": ["mail", "contact", "@"],
    "pay": ["total", "amount", "₹", "rs", "payable"],
    "much": ["total", "amount", "₹", "rs", "payable"],
    "due": ["date", "last", "before", "deadline"],
    "last": ["date", "due", "deadline"],
}


def relevant_text(text: str, question: str) -> str:
    """The pieces of the page text that share words with the question, in page order.
    Empty if nothing matches. Lets Nudi answer about things far down a long page."""
    words = {w for w in re.findall(r"[a-z0-9@₹]+", question.lower()) if w not in _STOP_WORDS and len(w) > 1}
    for word in list(words):
        words.update(_SAME_AS.get(word, []))
    if not words:
        return ""
    lowered = text.lower()
    scored = []
    starts = list(range(0, max(len(text) - _WINDOW, 0) + 1, _STEP))
    if len(text) > _WINDOW and starts[-1] != len(text) - _WINDOW:
        starts.append(len(text) - _WINDOW)  # the very end of the page (often "Contact us")
    for start in starts:
        piece = lowered[start : start + _WINDOW]
        score = sum(1 for w in words if w in piece)
        if score:
            scored.append((score, start))
    best = sorted(sorted(scored, reverse=True)[: _MAX_RELEVANT // _WINDOW], key=lambda s: s[1])
    return " … ".join(text[start : start + _WINDOW].strip() for _, start in best)


def _parse_json(text: str) -> dict:
    """Models sometimes wrap JSON in ``` fences or add words; keep only the {...} part."""
    return json.loads(text[text.index("{") : text.rindex("}") + 1])


def _ai_warnings(raw: list) -> list[PageWarning]:
    """Keep at most 2 well-formed warnings. The AI can raise a warning, never lower one."""
    warnings = []
    for item in raw[:2]:
        if isinstance(item, dict) and item.get("level") in ("caution", "danger") and item.get("message"):
            warnings.append(PageWarning(level=item["level"], message=str(item["message"])[:200], source="ai"))
    return warnings


class AiDecision(BaseModel):
    """The shape the AI's decision MUST have (like Instructor: validate, never guess)."""

    action: str = Field(pattern=r"^(watch|ask_family|block)$")
    reasons: list[str] = Field(default_factory=list, max_length=5)


def _ai_decision(raw: object) -> Decision | None:
    """A validated decision from the AI, or None if it gave none or a broken one."""
    try:
        parsed = AiDecision.model_validate(raw)
    except ValidationError:
        return None
    reasons = [str(r)[:200] for r in parsed.reasons if str(r).strip()][:3]
    if parsed.action != "watch" and not reasons:
        return None  # a stricter decision must say why (the user sees the reasons)
    return Decision(action=parsed.action, reasons=reasons, source="ai")


def simplify(page: PageSnapshot) -> tuple[str, list[Action], list[PageWarning], Decision | None, str]:
    """Returns (summary, actions, AI warnings, AI decision or None, mode).
    mode = which AI answered, or "mock"."""
    key = hashlib.sha256(_page_prompt(page).encode()).hexdigest()
    cached = _simplify_cache.get(key)
    if cached and time.time() - cached[0] < _CACHE_SECONDS:
        return cached[1]

    try:
        reply, mode = llm.generate(_SIMPLIFY_SYSTEM, _page_prompt(page), max_tokens=800, want_json=True)
        data = _parse_json(reply)
        valid_ids = {e.id for e in page.elements}  # drop choices the AI made up
        actions = [Action(**a) for a in data.get("actions", []) if a.get("element_id") in valid_ids][:5]
        if not actions:
            raise ValueError("AI gave no usable choices")
        result = (
            str(data.get("summary", ""))[:300],
            actions,
            _ai_warnings(data.get("warnings", [])),
            _ai_decision(data.get("decision")),
            mode,
        )
    except (llm.NoAI, ValueError, KeyError, TypeError):
        summary, actions = mock_ai.simplify(page)
        result = (summary, actions, [], None, "mock")

    # Only remember useful answers. A page read too early (still loading) gives
    # no choices; next time it should be read fresh, not served from memory.
    if result[1]:
        _simplify_cache[key] = (time.time(), result)
    return result


# ---------------------------------------------------------------------------
# Questions and explanations
# ---------------------------------------------------------------------------

_ASK_SYSTEM = f"""You help elderly and low-tech users understand a web page.
Answer the question in one or two short sentences, using ONLY the page information given.
If the page does not say, answer that you cannot see it on this page.
Never ask for an OTP, PIN, password or card number, and warn against sharing them.
{PLAIN_WORDS}"""

_EXPLAIN_SYSTEM = f"""You explain confusing words on websites to elderly users in India.
Explain the given text in at most three short sentences: what it means, and if it matters for their money or safety.
If it looks like a scam or a trick, say so clearly.
{PLAIN_WORDS}"""


def answer(question: str, page: PageSnapshot) -> tuple[str, str]:
    # The parts of the page that match the question go FIRST, then the whole page
    # (up to 6000 characters), so an answer far down a long page is not missed.
    matching = relevant_text(page.text, question)
    prompt = _page_prompt(page, text_limit=6000)
    if matching:
        prompt = f"Parts of the page that match the question:\n{matching}\n\n{prompt}"
    try:
        return llm.generate(_ASK_SYSTEM, f"{prompt}\n\nQuestion: {question}", max_tokens=200)
    except llm.NoAI:
        return mock_answers.answer(question, page), "mock"


def explain(text: str, page_title: str) -> tuple[str, str]:
    try:
        return llm.generate(_EXPLAIN_SYSTEM, f"Website: {page_title}\n\nText to explain: {text}", max_tokens=200)
    except llm.NoAI:
        return mock_answers.explain(text), "mock"


# ---------------------------------------------------------------------------
# Family weekly digest
# ---------------------------------------------------------------------------

_DIGEST_SYSTEM = """You write a short, warm weekly note for a family member about how their elderly
relative used the internet with Nudi's help. Three sentences at most. Mention the numbers given.
Be reassuring but honest; if a scam was stopped, say so calmly. Plain text, no markdown, no emojis.
Use only the facts given; never invent websites, amounts or events."""


def weekly_digest(elder: str, helper: str, summary: dict, highlights: list[str]) -> tuple[str, str]:
    facts = (
        f"Elder: {elder}. Family member reading this: {helper}.\n"
        f"This week: {summary['tasks_done']} tasks with Nudi, {summary['scams_blocked']} payments stopped, "
        f"money saved: Rs {summary['money_saved']}.\n"
        "Recent events:\n- " + "\n- ".join(highlights[:8] or ["No activity yet"])
    )
    try:
        return llm.generate(_DIGEST_SYSTEM, facts, max_tokens=200)
    except llm.NoAI:
        return mock_answers.digest(elder, summary), "mock"
