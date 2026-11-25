"""
Ollama: a free AI model running on THIS computer. No key, no internet,
and the page text never leaves the machine.
Docs: https://github.com/ollama/ollama/blob/main/docs/api.md

Set OLLAMA_MODEL (for example a small model you pulled with `ollama pull ...`)
to turn it on. Empty = not used.
"""

import httpx

from ... import config

_TIMEOUT_SECONDS = 20  # a laptop is slower than a cloud AI; still give up before the user does


def generate(system: str, prompt: str, max_tokens: int, want_json: bool) -> str:
    body = {
        "model": config.OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": 0.2},
    }
    if want_json:
        body["format"] = "json"

    response = httpx.post(f"{config.OLLAMA_URL.rstrip('/')}/api/chat", json=body, timeout=_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()["message"]["content"] or ""
