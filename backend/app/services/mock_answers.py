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


# ---------------------------------------------------------------------------
# "Explain this" without AI: a small glossary of words that confuse people
# ---------------------------------------------------------------------------

_GLOSSARY = {
    "otp": "An OTP is a one-time code sent to your phone to confirm it is really you. Never tell it to anyone, not even someone who says they are from the bank.",
    "kyc": "KYC means 'Know Your Customer': your bank checking your identity. Banks never ask you to update KYC through a link or a phone call. Visit the branch instead.",
    "cvv": "The CVV is the 3-digit number on the back of your card. Never share it with anyone.",
    "upi pin": "Your UPI PIN is your secret number for sending money. You never need it to RECEIVE money.",
    "convenience fee": "A convenience fee is an extra charge for paying online. Check the total before you pay.",
    "processing fee": "A processing fee is an extra charge added to the price. Check the total before you pay.",
    "gst": "GST is a government tax added to the price. It is normal on most bills.",
    "emi": "EMI means paying in monthly parts instead of all at once. It often costs more in total because of interest.",
    "auto-debit": "Auto-debit means money is taken from your account every month without asking you again. Only allow it if you are sure.",
    "autopay": "Autopay means money is taken from your account automatically, again and again. Only allow it if you are sure.",
    "subscription": "A subscription charges you again every month or year until you cancel it.",
    "protection plan": "A protection plan is an extra you pay for. It is usually optional; you can untick it.",
    "free trial": "A free trial often starts charging you automatically when it ends. Note the date so you can cancel.",
    "consumer number": "The consumer number is the ID of your electricity or gas connection. It is printed at the top of your paper bill.",
    "anydesk": "AnyDesk lets someone else control your computer. Never install it because a caller or a website tells you to.",
    "refund": "Real refunds never need your OTP or PIN. If someone asks for one to 'send you a refund', it is a scam.",
}


def explain(text: str) -> str:
    lowered = text.lower()
    for word, meaning in _GLOSSARY.items():
        if word in lowered:
            return meaning
    return (
        "I cannot explain this one without my AI helper. If it asks for money, an OTP or a password, "
        "stop and ask a family member first."
    )


def digest(elder: str, summary: dict) -> str:
    """The family's weekly note, written from the numbers only."""
    if summary["tasks_done"] == 0 and summary["scams_blocked"] == 0:
        return f"{elder} has not used Nudi yet this week. You will see a short note here once they do."
    parts = [f"{elder} used Nudi for {summary['tasks_done']} task{'s' if summary['tasks_done'] != 1 else ''} this week."]
    if summary["scams_blocked"]:
        parts.append(f"Nudi stopped {summary['scams_blocked']} risky payment{'s' if summary['scams_blocked'] != 1 else ''}.")
    if summary["money_saved"]:
        parts.append(f"About Rs {summary['money_saved']:,} was saved.")
    return " ".join(parts)
