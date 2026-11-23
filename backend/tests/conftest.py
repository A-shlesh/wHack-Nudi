# Shared test setup: force MOCK mode so tests never call AWS or ElevenLabs.

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app


@pytest.fixture(autouse=True)
def mock_mode(monkeypatch):
    monkeypatch.setattr(config, "USE_REAL_BEDROCK", False)
    monkeypatch.setattr(config, "USE_REAL_ELEVENLABS", False)


@pytest.fixture
def client():
    return TestClient(app)
