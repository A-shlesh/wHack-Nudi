# Tests for llm.py (the chain of AI services) and config (which AIs are set up).
# No real network: the AI services are replaced by tiny fakes.

import pytest

from app import config
from app.services import llm


def fake(reply=None, error=None):
    def generate(system, prompt, max_tokens, want_json):
        if error:
            raise error
        return reply

    return generate


def use(monkeypatch, order, **providers):
    monkeypatch.setattr(config, "ai_providers", lambda: order)
    for name, provider in providers.items():
        monkeypatch.setitem(llm._PROVIDERS, name, provider)


def test_first_ai_answers(monkeypatch):
    use(monkeypatch, ["gemini", "groq"], gemini=fake("from gemini"), groq=fake("from groq"))
    assert llm.generate("s", "p") == ("from gemini", "gemini")


def test_failure_moves_to_next_ai(monkeypatch):
    use(monkeypatch, ["gemini", "groq"], gemini=fake(error=RuntimeError("down")), groq=fake("from groq"))
    assert llm.generate("s", "p") == ("from groq", "groq")


def test_empty_reply_is_skipped(monkeypatch):
    use(monkeypatch, ["gemini", "groq"], gemini=fake("   "), groq=fake("from groq"))
    assert llm.generate("s", "p") == ("from groq", "groq")


def test_all_fail_raises_noai(monkeypatch):
    use(monkeypatch, ["gemini", "groq"], gemini=fake(error=RuntimeError("x")), groq=fake(""))
    with pytest.raises(llm.NoAI):
        llm.generate("s", "p")


def test_no_providers_raises_noai():
    with pytest.raises(llm.NoAI):
        llm.generate("s", "p")


def test_key_placeholder_counts_as_no_key(monkeypatch):
    monkeypatch.setenv("SOME_KEY", "your-gemini-key-here")
    assert config._key("SOME_KEY") == ""
    monkeypatch.setenv("SOME_KEY", "  real-key  ")
    assert config._key("SOME_KEY") == "real-key"
    monkeypatch.delenv("SOME_KEY")
    assert config._key("SOME_KEY") == ""


def real_providers(monkeypatch, order, gemini="", groq="", bedrock=False):
    """Run the real config.ai_providers (the test fixture normally turns it off)."""
    monkeypatch.setattr(config, "ai_providers", _REAL_AI_PROVIDERS)
    monkeypatch.setattr(config, "GEMINI_API_KEY", gemini)
    monkeypatch.setattr(config, "GROQ_API_KEY", groq)
    monkeypatch.setattr(config, "USE_REAL_BEDROCK", bedrock)
    monkeypatch.setattr(config, "AI_ORDER", order)
    return config.ai_providers()


# Saved at import time, before the fixture replaces it.
_REAL_AI_PROVIDERS = config.ai_providers


def test_ai_providers_skips_missing_keys(monkeypatch):
    assert real_providers(monkeypatch, ["gemini", "groq", "bedrock"], groq="k") == ["groq"]


def test_ai_providers_follows_ai_order(monkeypatch):
    result = real_providers(monkeypatch, ["groq", "gemini"], gemini="a", groq="b")
    assert result == ["groq", "gemini"]


def test_ai_providers_empty_means_offline(monkeypatch):
    assert real_providers(monkeypatch, ["gemini", "groq", "bedrock"]) == []
