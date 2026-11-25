"""
Family Link API: lets a family member help an elder with payments.

How pairing works:
  1. Extension  POST /family/pair/start   -> 6-digit code (10 minutes) + elder token
  2. Dashboard  POST /family/pair/join    -> enters the code, gets a family token
  3. Extension shows "Sushant wants to connect. Allow?"
     Extension  POST /family/pair/answer  -> the ELDER decides. Nothing is shared before "Allow".

Security:
  - Every later call needs a secret token ("Authorization: Bearer ..."), one for
    the elder's extension and one for the family dashboard. Only a hash of each
    secret is stored.
  - Codes work once, expire after 10 minutes, and wrong guesses are limited.

Privacy (what may be shared, and nothing else):
  - events: only the kinds in EventIn below, with a level or an amount.
    Never page text, never what was typed, never browsing history.
  - approvals: the website name (domain only), the amount, and the trust reasons.
    Two kinds: "payment" (may I pay?) and "site" (I think this website is fine;
    please check). Approving a "site" request lets the elder's Nudi trust it.
  - The elder can pause sharing at any time; then events are not stored.
"""

import hashlib
import hmac
import re
import secrets
import time
import uuid
from collections import defaultdict
from typing import Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .services import ai_features, voice
from .storage import Storage, make_storage
from . import domain_trust
from .trust.domains import registrable_domain

router = APIRouter()
_storage: Storage | None = None

CODE_SECONDS = 10 * 60
MAX_JOIN_TRIES = 10  # wrong codes allowed per client every 10 minutes
WEEK_SECONDS = 7 * 24 * 3600


def storage() -> Storage:
    """Created on first use, so tests can swap it before any request."""
    global _storage
    if _storage is None:
        _storage = make_storage()
    return _storage


def set_storage(new_storage: Storage) -> None:
    global _storage
    _storage = new_storage


def _now() -> float:
    return time.time()


def _new_id() -> str:
    """Starts with the time, so newer ids sort after older ones."""
    return f"{int(_now() * 1000):013d}-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _make_token(family_id: str, role: str) -> tuple[str, str]:
    """Returns (token for the client, hash to store). Token = family_id.role.secret"""
    secret = secrets.token_urlsafe(24)
    return f"{family_id}.{role}.{secret}", _hash(secret)


def _family_from_token(authorization: str | None, role: str) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    try:
        family_id, token_role, secret = authorization.removeprefix("Bearer ").split(".", 2)
    except ValueError:
        raise HTTPException(401, "Bad token")
    family = storage().get_family(family_id)
    stored_hash = (family or {}).get(f"{role}_token_hash")
    if token_role != role or not stored_hash or not hmac.compare_digest(stored_hash, _hash(secret)):
        raise HTTPException(401, "Bad token")
    return family


def elder_family(authorization: str | None = Header(default=None)) -> dict:
    return _family_from_token(authorization, "elder")


def helper_family(authorization: str | None = Header(default=None)) -> dict:
    return _family_from_token(authorization, "family")


# ---------------------------------------------------------------------------
# Pairing
# ---------------------------------------------------------------------------


class StartRequest(BaseModel):
    elder_name: str = Field(default="Ajji", min_length=1, max_length=40)


class JoinRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")
    family_name: str = Field(default="Sushant", min_length=1, max_length=40)


class AnswerRequest(BaseModel):
    allow: bool


class SharingRequest(BaseModel):
    on: bool


# client address -> times of wrong code guesses
_wrong_guesses: dict[str, list[float]] = defaultdict(list)


def reset_rate_limit() -> None:
    _wrong_guesses.clear()
    _starts.clear()


def _new_code() -> str:
    for _ in range(20):
        code = f"{secrets.randbelow(1_000_000):06d}"
        if storage().get_code(code) is None:
            return code
    raise HTTPException(503, "Please try again")


# client address -> times pairing was started (stops someone filling the database)
_starts: dict[str, list[float]] = defaultdict(list)
MAX_STARTS = 10


@router.post("/family/pair/start")
def pair_start(body: StartRequest, request: Request):
    client = request.client.host if request.client else "unknown"
    _starts[client] = [t for t in _starts[client] if _now() - t < CODE_SECONDS] + [_now()]
    if len(_starts[client]) > MAX_STARTS:
        raise HTTPException(429, "Too many tries. Please wait 10 minutes.")
    family_id = uuid.uuid4().hex[:12]
    elder_token, elder_hash = _make_token(family_id, "elder")
    code = _new_code()
    storage().put_family({
        "family_id": family_id,
        "elder_name": body.elder_name.strip(),
        "family_name": None,
        "status": "waiting",  # waiting -> request -> paired (or rejected)
        "sharing_on": True,
        "elder_token_hash": elder_hash,
        "family_token_hash": None,
        "code_expires_at": _now() + CODE_SECONDS,
        "created_at": _now(),
    })
    storage().put_code(code, family_id, _now() + CODE_SECONDS)
    return {"family_id": family_id, "code": code, "elder_token": elder_token, "expires_in_seconds": CODE_SECONDS}


@router.post("/family/pair/join")
def pair_join(body: JoinRequest, request: Request):
    client = request.client.host if request.client else "unknown"
    recent = [t for t in _wrong_guesses[client] if _now() - t < CODE_SECONDS]
    _wrong_guesses[client] = recent
    if len(recent) >= MAX_JOIN_TRIES:
        raise HTTPException(429, "Too many wrong codes. Please wait 10 minutes.")

    found = storage().get_code(body.code)
    family = storage().get_family(found["family_id"]) if found else None
    if not found or found["expires_at"] < _now() or not family or family["status"] != "waiting":
        _wrong_guesses[client].append(_now())
        raise HTTPException(404, "That code is wrong or has expired.")

    storage().delete_code(body.code)  # a code works only once
    family_token, family_hash = _make_token(family["family_id"], "family")
    family.update(status="request", family_name=body.family_name.strip(), family_token_hash=family_hash)
    storage().put_family(family)
    return {"family_id": family["family_id"], "family_token": family_token, "elder_name": family["elder_name"]}


@router.get("/family/pair/status")
def pair_status(family: dict = Depends(elder_family)):
    status = family["status"]
    if status == "waiting" and family["code_expires_at"] < _now():
        status = "expired"
    return {"status": status, "family_name": family["family_name"], "sharing_on": family["sharing_on"]}


@router.post("/family/pair/answer")
def pair_answer(body: AnswerRequest, family: dict = Depends(elder_family)):
    if family["status"] != "request":
        raise HTTPException(409, "Nobody is waiting to connect.")
    if body.allow:
        family["status"] = "paired"
        _store_event(family, {"kind": "paired"})
    else:
        family.update(status="rejected", family_token_hash=None)
    storage().put_family(family)
    return {"status": family["status"]}


@router.post("/family/unpair")
def unpair(family: dict = Depends(elder_family)):
    """The elder disconnects: the family member's token stops working at once."""
    family.update(status="unpaired", family_token_hash=None, elder_token_hash=None)
    storage().put_family(family)
    return {"status": "unpaired"}


@router.post("/family/sharing")
def set_sharing(body: SharingRequest, family: dict = Depends(elder_family)):
    if family["status"] == "paired" and family["sharing_on"] and not body.on:
        _store_event(family, {"kind": "sharing_paused"})  # the last thing family sees
    family["sharing_on"] = body.on
    storage().put_family(family)
    if body.on:
        _store_event(family, {"kind": "sharing_resumed"})
    return {"sharing_on": family["sharing_on"]}


# ---------------------------------------------------------------------------
# Events (only these kinds can ever be stored)
# ---------------------------------------------------------------------------


class EventIn(BaseModel):
    kind: Literal[
        "task_started", "warning_shown", "addon_removed", "payment_confirmed", "payment_blocked",
        "payment_overridden",  # the elder chose "pay anyway" after Nudi's warning and wait
    ]
    level: Literal["caution", "danger"] | None = None
    amount: float | None = Field(default=None, ge=0, le=10_000_000)
    amount_saved: float | None = Field(default=None, ge=0, le=10_000_000)


def _store_event(family: dict, fields: dict) -> None:
    storage().add_event(family["family_id"], {"id": _new_id(), "at": _now(), **fields})


@router.post("/events")
def log_event(body: EventIn, family: dict = Depends(elder_family)):
    if family["status"] != "paired" or not family["sharing_on"]:
        return {"stored": False}  # sharing paused or not paired: store nothing
    _store_event(family, body.model_dump(exclude_none=True))
    return {"stored": True}


# ---------------------------------------------------------------------------
# Approvals
# ---------------------------------------------------------------------------


class ApprovalIn(BaseModel):
    kind: Literal["payment", "site"] = "payment"
    site: str = Field(max_length=253)
    # Only a money amount such as "₹1,275" or "Rs 500". No other text can get through.
    amount: str | None = Field(default=None, pattern=r"^(₹|Rs\.?|INR)\s?\d[\d,]*(\.\d{1,2})?$")
    age_days: int | None = Field(default=None, ge=0, le=100_000)


class DecisionIn(BaseModel):
    decision: Literal["approved", "blocked"]


def _clean_site(site: str) -> str:
    """Host name only, even if a full address (with path, ?query, #part or user:password@) was sent."""
    host = (urlparse(site if "://" in site else "//" + site).hostname or "").lower().removeprefix("www.")
    if not re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", host):
        raise HTTPException(422, "The website must be a plain domain name.")
    return host


def _server_reasons(site: str, age_days: int | None) -> list[str]:
    """The reasons are written HERE from the domain and its age, never copied from the client,
    so no page text can ever reach the family."""
    _, age_reasons = domain_trust.age_reasons(age_days)
    _, brand_reasons, _ = domain_trust.lookalike_reasons(registrable_domain(site), site)
    return [r.message_simple for r in age_reasons + brand_reasons if r.code != "OFFICIAL_BRAND"]


def voice_note_text(elder: str, amount: str | None, site: str, age_days: int | None, kind: str = "payment") -> str:
    if kind == "site":
        text = f"{elder} thinks {site} is a real website and asks you to check it"
        if age_days is not None and age_days < 365:
            text += f". It was made {age_days} days ago"
        return text + ". Please look in Nudi."
    money = (amount or "some money").replace("₹", "Rs ")
    text = f"{elder} is trying to pay {money} to {site}"
    if age_days is not None and age_days < 365:
        text += f", a website made {age_days} days ago"
    return text + ". Please check it in Nudi."


@router.post("/approvals")
def create_approval(body: ApprovalIn, family: dict = Depends(elder_family)):
    if family["status"] != "paired" or not family["sharing_on"]:
        raise HTTPException(409, "Family Link is not on.")
    site = _clean_site(body.site)
    reasons = _server_reasons(site, body.age_days)
    amount = body.amount if body.kind == "payment" else None
    text = voice_note_text(family["elder_name"], amount, site, body.age_days, body.kind)
    audio = voice.speak(text)  # None in mock mode: the dashboard reads the text aloud itself
    approval = {
        "id": _new_id(),
        "at": _now(),
        "status": "pending",
        "kind": body.kind,
        "site": site,
        "amount": amount,
        "reasons": reasons,
        "voice_text": text,
        "voice_b64": audio.hex() if audio else None,  # hex keeps it a plain string
    }
    storage().put_approval(family["family_id"], approval)
    if body.kind == "site":
        _store_event(family, {"kind": "site_check_requested", "site": site})
    else:
        _store_event(family, {"kind": "approval_requested", "amount_text": amount, "site": site})
    return {"approval_id": approval["id"]}


@router.get("/approvals/{approval_id}")
def approval_status(approval_id: str, family: dict = Depends(elder_family)):
    approval = storage().get_approval(family["family_id"], approval_id)
    if not approval:
        raise HTTPException(404, "No such request")
    return {"status": approval["status"]}


@router.post("/approvals/{approval_id}/decision")
def decide(approval_id: str, body: DecisionIn, family: dict = Depends(helper_family)):
    approval = storage().get_approval(family["family_id"], approval_id)
    if not approval:
        raise HTTPException(404, "No such request")
    if approval["status"] != "pending":
        raise HTTPException(409, "Already answered")
    approval.update(status=body.decision, decided_at=_now())
    storage().put_approval(family["family_id"], approval)
    return {"status": approval["status"]}


@router.get("/approvals/{approval_id}/voice")
def approval_voice(approval_id: str, family: dict = Depends(helper_family)):
    approval = storage().get_approval(family["family_id"], approval_id)
    if not approval:
        raise HTTPException(404, "No such request")
    if not approval.get("voice_b64"):
        return Response(status_code=204)  # mock mode: use the browser voice
    return Response(content=bytes.fromhex(approval["voice_b64"]), media_type="audio/mpeg")


# ---------------------------------------------------------------------------
# Family dashboard feed
# ---------------------------------------------------------------------------


def _rupees(value: float | None) -> str:
    return f"₹{value:,.0f}" if value else ""


def describe(event: dict, elder: str, helper: str) -> tuple[str, str]:
    """(icon name, plain sentence) for one event. The dashboard shows these as they are."""
    kind = event["kind"]
    if kind == "task_started":
        return "task", f"{elder} started a task with Nudi"
    if kind == "warning_shown":
        if event.get("level") == "danger":
            return "danger", f"Nudi warned {elder} about a possible scam"
        return "caution", f"Nudi asked {elder} to be careful on a page"
    if kind == "addon_removed":
        return "saved", f"Nudi removed a sneaky extra and saved {_rupees(event.get('amount_saved')) or 'money'}"
    if kind == "payment_confirmed":
        amount = _rupees(event.get("amount"))
        return "paid", f"{elder} made a payment of {amount} after checking" if amount else f"{elder} made a payment after checking"
    if kind == "payment_blocked":
        amount = _rupees(event.get("amount"))
        return "blocked", f"A payment of {amount} was stopped" if amount else "A payment was stopped"
    if kind == "payment_overridden":
        amount = _rupees(event.get("amount"))
        money = f"a payment of {amount}" if amount else "a payment"
        return "paid", f"{elder} chose to make {money} after Nudi warned them and asked them to wait"
    if kind == "site_check_requested":
        return "ask", f"{elder} asked you to check whether {event.get('site')} is a real website"
    if kind == "approval_requested":
        return "ask", f"{elder} asked you to check a payment of {event.get('amount_text') or 'money'} to {event.get('site')}"
    if kind == "paired":
        return "link", f"{elder} connected Family Link with {helper}"
    if kind == "sharing_paused":
        return "pause", f"{elder} paused sharing"
    if kind == "sharing_resumed":
        return "link", f"{elder} turned sharing back on"
    return "task", "Nudi activity"


def weekly_summary(events: list[dict]) -> dict:
    week = [e for e in events if _now() - e["at"] < WEEK_SECONDS]
    saved = sum(e.get("amount_saved", 0) for e in week if e["kind"] == "addon_removed")
    saved += sum(e.get("amount", 0) for e in week if e["kind"] == "payment_blocked")
    return {
        "tasks_done": sum(1 for e in week if e["kind"] == "task_started"),
        "scams_blocked": sum(1 for e in week if e["kind"] == "payment_blocked"),
        "money_saved": round(saved),
    }


@router.get("/family/{family_id}/feed")
def feed(family_id: str, family: dict = Depends(helper_family)):
    if family["family_id"] != family_id:
        raise HTTPException(403, "Not your family")
    elder, helper = family["elder_name"], family["family_name"] or "you"
    events = storage().list_events(family_id) if family["status"] == "paired" else []
    approvals = storage().list_approvals(family_id) if family["status"] == "paired" else []
    return {
        "status": family["status"],
        "elder_name": elder,
        "family_name": family["family_name"],
        "sharing_on": family["sharing_on"],
        "pending": [
            {k: a[k] for k in ("id", "at", "site", "amount", "reasons", "voice_text")}
            | {"kind": a.get("kind", "payment"), "has_voice": bool(a.get("voice_b64"))}
            for a in approvals
            if a["status"] == "pending"
        ],
        "events": [
            {"id": e["id"], "at": e["at"], "icon": icon, "text": text}
            for e in events[:50]
            for icon, text in [describe(e, elder, helper)]
        ],
        "summary": weekly_summary(events),
    }


# ---------------------------------------------------------------------------
# Weekly digest: a short AI-written note for the family member
# ---------------------------------------------------------------------------

DIGEST_CACHE_SECONDS = 30 * 60
# family id -> (time written, number of events then, digest, mode)
_digests: dict[str, tuple[float, int, str, str]] = {}


@router.get("/family/{family_id}/digest")
def digest(family_id: str, family: dict = Depends(helper_family)):
    """Written from the week's numbers and event sentences only (no page content exists to leak).
    Rewritten at most every 30 minutes, or sooner when new events arrive."""
    if family["family_id"] != family_id:
        raise HTTPException(403, "Not your family")
    events = storage().list_events(family_id) if family["status"] == "paired" else []
    cached = _digests.get(family_id)
    if cached and cached[1] == len(events) and _now() - cached[0] < DIGEST_CACHE_SECONDS:
        return {"digest": cached[2], "mode": cached[3]}

    elder, helper = family["elder_name"], family["family_name"] or "you"
    week = [e for e in events if _now() - e["at"] < WEEK_SECONDS]
    highlights = [describe(e, elder, helper)[1] for e in week]
    text, mode = ai_features.weekly_digest(elder, helper, weekly_summary(events), highlights)
    _digests[family_id] = (_now(), len(events), text, mode)
    return {"digest": text, "mode": mode}
