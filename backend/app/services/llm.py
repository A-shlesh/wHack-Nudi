"""
One door to every AI model Nudi can use.

generate() tries the AI services in order (by default Ollama on this computer,
then Gemini, Groq and Bedrock), skipping any that are not set up. If one fails (no internet, rate limit,
bad reply), it quietly tries the next. If all fail it raises NoAI, and the
caller uses Nudi's offline rules instead. So the demo never breaks.

Privacy: callers only pass text that has already gone through privacy.redact().
"""

import logging

from .. import config
from .providers import bedrock, gemini, groq, ollama

log = logging.getLogger("nudi.llm")

_PROVIDERS = {
    "ollama": ollama.generate,
    "gemini": gemini.generate,
    "groq": groq.generate,
    "bedrock": bedrock.generate,
}


class NoAI(Exception):
    """No AI service is set up, or all of them failed."""


def generate(system: str, prompt: str, max_tokens: int = 600, want_json: bool = False) -> tuple[str, str]:
    """Returns (reply text, name of the AI that answered)."""
    for name in config.ai_providers():
        try:
            reply = _PROVIDERS[name](system, prompt, max_tokens, want_json)
            if reply and reply.strip():
                return reply.strip(), name
        except Exception as error:  # any failure: try the next AI
            log.warning("AI %s failed, trying the next one: %s", name, error)
    raise NoAI("No AI service answered")
