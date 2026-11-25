"""
Reads settings from the .env file and decides which services run for real
and which run in MOCK mode.

Rule: if a key or credential is missing, that service uses mock mode,
so the demo always works.
"""

import os

from dotenv import load_dotenv

# Load backend/.env (if it exists) into environment variables.
load_dotenv()



def _key(name: str) -> str:
    """Read a key; the placeholders in .env.example ("your-...-here") count as no key."""
    value = os.getenv(name, "").strip()
    return "" if value.startswith("your-") else value


# --- Gemini (main AI, has a free tier) and Groq (free backup AI) ---
GEMINI_API_KEY = _key("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "")
GROQ_API_KEY = _key("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "")

# --- Ollama (free AI on this computer; nothing leaves the machine) ---
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "")  # empty = not used

# Which AI to try first, second, third. Any that is not set up is skipped.
# Ollama goes first: when it is set up, page text stays on this computer.
# If none work, Nudi uses its own offline rules (mock mode).
AI_ORDER = [name.strip() for name in os.getenv("AI_ORDER", "ollama,gemini,groq,bedrock").split(",") if name.strip()]

# --- AWS Bedrock (optional third AI) ---
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "")

# Bedrock can be used with normal AWS keys or with a Bedrock API key.
_has_aws_keys = bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"))
_has_bedrock_key = bool(os.getenv("AWS_BEARER_TOKEN_BEDROCK"))
USE_REAL_BEDROCK = bool(BEDROCK_MODEL_ID) and (_has_aws_keys or _has_bedrock_key)


def ai_providers() -> list[str]:
    """The AI services that are set up, in the order to try them. Empty = offline mode."""
    ready = {
        "ollama": bool(OLLAMA_MODEL),
        "gemini": bool(GEMINI_API_KEY),
        "groq": bool(GROQ_API_KEY),
        "bedrock": USE_REAL_BEDROCK,
    }
    return [name for name in AI_ORDER if ready.get(name)]

# --- ElevenLabs (natural voice) ---
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")
ELEVENLABS_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "")
USE_REAL_ELEVENLABS = bool(ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID)
