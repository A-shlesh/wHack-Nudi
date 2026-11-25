# Tests for the Gemini and Groq calls. httpx.post is replaced by a fake,
# so we only check what Nudi SENDS and how it READS the reply.

import httpx
import pytest

from app import config
from app.services.providers import gemini, groq


class FakeResponse:
    def __init__(self, data, status=200):
        self.data, self.status = data, status

    def raise_for_status(self):
        if self.status >= 400:
            raise httpx.HTTPError("bad status")

    def json(self):
        return self.data


def capture(monkeypatch, module, response):
    sent = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        sent.update(url=url, headers=headers, json=json)
        return response

    monkeypatch.setattr(module.httpx, "post", fake_post)
    return sent


GEMINI_REPLY = {"candidates": [{"content": {"parts": [{"text": "Hello "}, {"text": "there"}]}}]}
GROQ_REPLY = {"choices": [{"message": {"content": "Hi from groq"}}]}


def test_gemini_request_and_reply(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "gem-key")
    sent = capture(monkeypatch, gemini, FakeResponse(GEMINI_REPLY))
    assert gemini.generate("be kind", "hi", 100, False) == "Hello there"
    assert sent["headers"]["x-goog-api-key"] == "gem-key"
    assert sent["json"]["systemInstruction"]["parts"][0]["text"] == "be kind"
    assert sent["json"]["generationConfig"]["maxOutputTokens"] == 100
    assert "responseMimeType" not in sent["json"]["generationConfig"]


def test_gemini_json_mode(monkeypatch):
    sent = capture(monkeypatch, gemini, FakeResponse(GEMINI_REPLY))
    gemini.generate("s", "p", 50, True)
    assert sent["json"]["generationConfig"]["responseMimeType"] == "application/json"


def test_gemini_http_error_raises(monkeypatch):
    capture(monkeypatch, gemini, FakeResponse({}, status=429))
    with pytest.raises(httpx.HTTPError):
        gemini.generate("s", "p", 50, False)


def test_groq_request_and_reply(monkeypatch):
    monkeypatch.setattr(config, "GROQ_API_KEY", "groq-key")
    sent = capture(monkeypatch, groq, FakeResponse(GROQ_REPLY))
    assert groq.generate("be kind", "hi", 120, False) == "Hi from groq"
    assert sent["headers"]["Authorization"] == "Bearer groq-key"
    assert sent["json"]["max_completion_tokens"] == 120
    assert sent["json"]["messages"][0] == {"role": "system", "content": "be kind"}
    assert "response_format" not in sent["json"]


def test_groq_json_mode(monkeypatch):
    sent = capture(monkeypatch, groq, FakeResponse(GROQ_REPLY))
    groq.generate("s", "p", 50, True)
    assert sent["json"]["response_format"] == {"type": "json_object"}


def test_groq_http_error_raises(monkeypatch):
    capture(monkeypatch, groq, FakeResponse({}, status=500))
    with pytest.raises(httpx.HTTPError):
        groq.generate("s", "p", 50, False)


# ---------- Ollama (free AI on this computer) ----------

from app.services.providers import ollama  # noqa: E402

OLLAMA_REPLY = {"message": {"role": "assistant", "content": "Hi from the laptop"}}


def test_ollama_request_and_reply(monkeypatch):
    monkeypatch.setattr(config, "OLLAMA_URL", "http://localhost:11434/")
    monkeypatch.setattr(config, "OLLAMA_MODEL", "small-model")
    sent = capture(monkeypatch, ollama, FakeResponse(OLLAMA_REPLY))
    assert ollama.generate("be kind", "hi", 120, False) == "Hi from the laptop"
    assert sent["url"] == "http://localhost:11434/api/chat"
    assert sent["headers"] is None  # no key: nothing secret is sent
    assert sent["json"]["model"] == "small-model"
    assert sent["json"]["stream"] is False
    assert sent["json"]["options"]["num_predict"] == 120
    assert sent["json"]["messages"][0] == {"role": "system", "content": "be kind"}
    assert "format" not in sent["json"]


def test_ollama_json_mode(monkeypatch):
    sent = capture(monkeypatch, ollama, FakeResponse(OLLAMA_REPLY))
    ollama.generate("s", "p", 50, True)
    assert sent["json"]["format"] == "json"


def test_ollama_is_only_used_when_a_model_is_set(monkeypatch):
    monkeypatch.undo()  # use the real ai_providers(), not the test fixture's "no AI"
    monkeypatch.setattr(config, "AI_ORDER", ["ollama", "groq"])
    monkeypatch.setattr(config, "GROQ_API_KEY", "")
    monkeypatch.setattr(config, "OLLAMA_MODEL", "")
    assert config.ai_providers() == []
    monkeypatch.setattr(config, "OLLAMA_MODEL", "small-model")
    assert config.ai_providers() == ["ollama"]
