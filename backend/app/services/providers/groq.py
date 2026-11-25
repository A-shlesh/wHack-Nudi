"""
Groq (OpenAI-style chat completions API). Nudi's backup AI: fast, with free limits.
Docs: https://console.groq.com/docs/api-reference
"""

import httpx

from ... import config

_URL = "https://api.groq.com/openai/v1/chat/completions"
_DEFAULT_MODEL = "qwen/qwen3.8-27b"  # fastest and best in our tests; change with GROQ_MODEL
_TIMEOUT_SECONDS = 8  # give up quickly so the next AI (or offline rules) can answer


def generate(system: str, prompt: str, max_tokens: int, want_json: bool) -> str:
    body = {
        "model": config.GROQ_MODEL or _DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "max_completion_tokens": max_tokens,
        "temperature": 0.2,
    }
    if want_json:
        body["response_format"] = {"type": "json_object"}

    response = httpx.post(
        _URL,
        headers={"Authorization": f"Bearer {config.GROQ_API_KEY}", "Content-Type": "application/json"},
        json=body,
        timeout=_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"] or ""
