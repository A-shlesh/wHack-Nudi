"""
The Nudi web server (FastAPI).

Endpoints:
  GET  /health    -> is the server up, and which services are real or mock
  POST /simplify  -> page summary in, Action View (summary, big buttons, warnings) out
  POST /speak     -> text in, MP3 audio out (or 204 = "use the browser voice")
  GET  /demo/     -> fake demo websites for testing the extension

Run it with:  uvicorn app.main:app --reload --port 8787
"""

from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .privacy import redact, safe_url
from .risk_rules import check_page, is_payment_label
from .schemas import PageSnapshot, SimplifyResponse, SpeakRequest
from .services import bedrock_ai, mock_ai, voice

app = FastAPI(title="Nudi backend")

# The extension calls us from web pages, so allow cross-origin requests.
# Fine for a local prototype; lock this down before any real deployment.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Serve the demo web pages (the fake, cluttered sites we test Nudi on) at /demo.
_DEMO_FOLDER = Path(__file__).resolve().parents[2] / "demo"
app.mount("/demo", StaticFiles(directory=_DEMO_FOLDER, html=True), name="demo")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "ai": "bedrock" if config.USE_REAL_BEDROCK else "mock",
        "voice": "elevenlabs" if config.USE_REAL_ELEVENLABS else "browser",
    }


@app.post("/simplify", response_model=SimplifyResponse)
def simplify(page: PageSnapshot):
    # Safety net: hide anything private that slipped through the extension's filter.
    page.url = safe_url(page.url)
    page.title = redact(page.title)
    page.text = redact(page.text)
    for element in page.elements:
        element.label = redact(element.label)

    mode = "mock"
    if config.USE_REAL_BEDROCK:
        try:
            summary, actions = bedrock_ai.simplify(page)
            mode = "bedrock"
        except Exception as error:  # any failure -> keep the demo running with mock
            print(f"Bedrock failed, using mock instead: {error}")
            summary, actions = mock_ai.simplify(page)
    else:
        summary, actions = mock_ai.simplify(page)

    # Never trust the AI alone about money. The AI may rename "Pay ₹5000" to "Finish",
    # so we check the ORIGINAL label of the page element too, not just the new label.
    original_labels = {element.id: element.label for element in page.elements}
    for action in actions:
        original = original_labels.get(action.element_id, "")
        if is_payment_label(action.label) or is_payment_label(original):
            action.is_payment = True

    return SimplifyResponse(summary=summary, actions=actions, warnings=check_page(page), mode=mode)


@app.post("/speak")
def speak(request: SpeakRequest):
    audio = voice.speak(redact(request.text))
    if audio is None:
        # 204 No Content tells the extension to use the browser's own voice.
        return Response(status_code=204)
    return Response(content=audio, media_type="audio/mpeg")
