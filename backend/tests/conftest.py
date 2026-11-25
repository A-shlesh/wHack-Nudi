# Shared test setup: force MOCK mode so tests never call Gemini, Groq, AWS or ElevenLabs.

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import ai_features


@pytest.fixture(autouse=True)
def mock_mode(monkeypatch):
    monkeypatch.setattr(config, "USE_REAL_BEDROCK", False)
    monkeypatch.setattr(config, "ai_providers", lambda: [])  # no AI calls in tests
    monkeypatch.setattr(config, "USE_REAL_ELEVENLABS", False)
    ai_features._simplify_cache.clear()  # each test starts without remembered pages


@pytest.fixture
def client():
    return TestClient(app)
