"""
MOCK version of "Ask Nudi" (questions about the current page).

Used when Bedrock is off. It answers the most common questions with simple
rules: how much to pay, when it is due, and whether the page looks safe.
"""

import re

from ..risk_rules import check_page
from ..schemas import PageSnapshot

# ₹1,339 or Rs. 1,339 or INR 1339
_AMOUNT = r"(?:₹|rs\.?|inr)\s?\d[\d,]*(?:\.\d+)?"
# 28 Nov, 28 November, Nov 28
_MONTHS = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*"
_DATE = rf"\b\d{{1,2}}\s{_MONTHS}\b|\b{_MONTHS}\s\d{{1,2}}\b"

_HELP = "I can help with questions like: How much do I pay? When is it due? Is this page safe?"


def _is_about(question: str, words: list[str]) -> bool:
    return any(word in question for word in words)


def _answer_amount(text: str) -> str:
    amounts = re.findall(_AMOUNT, text, re.IGNORECASE)
    if not amounts:
        return "I cannot see any amount of money on this page."
    # Prefer the amount that comes right after the word "total".
    total = re.search(rf"total[^₹\d]{{0,30}}({_AMOUNT})", text, re.IGNORECASE)
    if total:
        return f"The total to pay is {total.group(1)}. Please check it matches your bill."
    return f"The page shows {', '.join(dict.fromkeys(amounts))}."


def _answer_due_date(text: str) -> str:
    match = re.search(rf"due[^.]{{0,40}}?({_DATE})", text, re.IGNORECASE)
    if match:
        return f"It is due on {match.group(1)}."
    return "I cannot find a due date on this page."


def _answer_safety(page: PageSnapshot) -> str:
    warnings = check_page(page)
    dangers = [w for w in warnings if w.level == "danger"]
    if dangers:
        return f"Be careful. {dangers[0].message}"
    if warnings:
        return f"Mostly fine, but {warnings[0].message[0].lower()}{warnings[0].message[1:]}"
    return "I did not find anything suspicious on this page. Still, never share your OTP."


def answer(question: str, page: PageSnapshot) -> str:
    """Return a short, plain-language answer without calling any AI service."""
    q = question.lower()
    text = f"{page.title} {page.text}"

    if _is_about(q, ["otp", "password", "pin", "cvv"]):
        return "Never share your OTP, PIN or password with anyone. Not even with me. Nudi never reads them."
    if _is_about(q, ["safe", "scam", "fraud", "trust", "real", "fake"]):
        return _answer_safety(page)
    if _is_about(q, ["how much", "amount", "total", "cost", "price", "pay"]):
        return _answer_amount(text)
    if _is_about(q, ["when", "due", "last date", "date", "deadline"]):
        return _answer_due_date(text)
    return f"Sorry, I am not sure. {_HELP}"
