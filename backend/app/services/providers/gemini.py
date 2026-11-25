"""
Google Gemini (REST generateContent API). Nudi's main AI: it has a free tier.
Docs: https://aistudio.google.com/api-reference/generate-content

Note: on the free tier Google may use what is sent to improve its products.
Nudi only ever sends text that has gone through its privacy filter.
"""

import httpx

from ... import config

_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_DEFAULT_MODEL = "gemini-3.5-flash-lite"  # fast, listed as stable; change with GEMINI_MODEL
_TIMEOUT_SECONDS = 15


def generate(system: str, prompt: str, max_tokens: int, want_json: bool) -> str:
    generation_config = {"maxOutputTokens": max_tokens, "temperature": 0.2}
    if want_json:
        generation_config["responseMimeType"] = "application/json"

    response = httpx.post(
        _URL.format(model=config.GEMINI_MODEL or _DEFAULT_MODEL),
        headers={"x-goog-api-key": config.GEMINI_API_KEY, "Content-Type": "application/json"},
        json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation_config,
        },
        timeout=_TIMEOUT_SECONDS,
    )
    response.raise_for_status()  # e.g. 429 = free limit reached: llm.py tries the next AI
    parts = response.json()["candidates"][0]["content"]["parts"]
    return "".join(part.get("text", "") for part in parts)
