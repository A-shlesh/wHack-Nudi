"""
The Nudi web server (FastAPI).

Endpoints:
  GET  /health    -> is the server up, and which services are real or mock
  POST /simplify  -> page summary in, Action View (summary, big buttons, warnings) out
  POST /ask       -> a question about the page in, a short plain answer out
  POST /explain   -> selected text in, a simple explanation out
  POST /trust     -> a website address in, a trust score with simple reasons out
  POST /speak     -> text in, MP3 audio out (or 204 = "use the browser voice")
  GET  /demo/     -> fake demo websites for testing the extension
  /family/..., /events, /approvals/...  -> Family Link (see family.py)
  GET  /dashboard/ -> the family dashboard (phone-friendly web page)

Run it with:  uvicorn app.main:app --reload --port 8787
"""

from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config, family
from .privacy import redact, safe_url
from .risk_rules import check_page, is_payment_label
from .domain_trust import check_trust
from .schemas import (
    AskRequest,
    AskResponse,
    ExplainRequest,
    ExplainResponse,
    PageSnapshot,
    SimplifyResponse,
    SpeakRequest,
    TrustRequest,
    TrustResponse,
)
from .services import ai_features, voice

app = FastAPI(title="Nudi backend")

# The extension calls us from web pages, so allow cross-origin requests.
# Fine for a local prototype; lock this down before any real deployment.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Family Link: pairing, events, approvals, dashboard feed (see family.py).
app.include_router(family.router)

# Serve the demo web pages (the fake, cluttered sites we test Nudi on) at /demo,
# and the family dashboard (plain HTML/CSS/JS) at /dashboard.
# Locally they are in the repo folders; on AWS they are copied into backend/static/.
_BACKEND = Path(__file__).resolve().parents[1]


def _static_folder(name: str) -> Path:
    in_repo = _BACKEND.parent / name
    return in_repo if in_repo.exists() else _BACKEND / "static" / name


app.mount("/demo", StaticFiles(directory=_static_folder("demo"), html=True), name="demo")
app.mount("/dashboard", StaticFiles(directory=_static_folder("family-dashboard"), html=True), name="dashboard")


@app.get("/health")
def health():
    providers = config.ai_providers()
    return {
        "status": "ok",
        "ai": providers[0] if providers else "mock",
        "ai_backups": providers[1:],
        "voice": "elevenlabs" if config.USE_REAL_ELEVENLABS else "browser",
    }


def _clean(page: PageSnapshot) -> None:
    """Safety net: hide anything private that slipped through the extension's filter."""
    page.url = safe_url(page.url)
    page.title = redact(page.title)
    page.text = redact(page.text)
    for element in page.elements:
        element.label = redact(element.label)


@app.post("/simplify", response_model=SimplifyResponse)
def simplify(page: PageSnapshot):
    _clean(page)
    summary, actions, ai_warnings, mode = ai_features.simplify(page)

    # Never trust the AI alone about money. The AI may rename "Pay ₹5000" to "Finish",
    # so we check the ORIGINAL label of the page element too, not just the new label.
    original_labels = {element.id: element.label for element in page.elements}
    for action in actions:
        original = original_labels.get(action.element_id, "")
        if is_payment_label(action.label) or is_payment_label(original):
            action.is_payment = True

    # Nudi's own rules always run. The AI can only ADD warnings on top of them.
    rule_warnings = check_page(page)
    known = {w.message for w in rule_warnings}
    warnings = rule_warnings + [w for w in ai_warnings if w.message not in known]
    return SimplifyResponse(summary=summary, actions=actions, warnings=warnings, mode=mode)


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest):
    _clean(request.page)
    answer, mode = ai_features.answer(redact(request.question), request.page)
    return AskResponse(answer=answer, mode=mode)


@app.post("/explain", response_model=ExplainResponse)
def explain(request: ExplainRequest):
    explanation, mode = ai_features.explain(redact(request.text), redact(request.page_title))
    return ExplainResponse(explanation=explanation, mode=mode)


@app.post("/trust", response_model=TrustResponse)
def trust(request: TrustRequest, http: Request):
    # Demo pages are served by this backend, so its own host may use demo tags.
    return check_trust(request, own_host=http.url.hostname or "")


@app.post("/speak")
def speak(request: SpeakRequest):
    audio = voice.speak(redact(request.text))
    if audio is None:
        # 204 No Content tells the extension to use the browser's own voice.
        return Response(status_code=204)
    return Response(content=audio, media_type="audio/mpeg")
