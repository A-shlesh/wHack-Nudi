"""
Text-to-speech with ElevenLabs.

If the ElevenLabs key or voice id is missing (MOCK mode), this returns None
and the extension speaks with the browser's built-in speechSynthesis instead.
"""

import httpx

from .. import config

_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

# eleven_v4_turbo is fast and supports Indian languages such as Kannada and Hindi.
_DEFAULT_MODEL = "eleven_v4_turbo"


def speak(text: str) -> bytes | None:
    """Return MP3 audio bytes, or None if we should use the browser voice."""
    if not config.USE_REAL_ELEVENLABS:
        return None

    try:
        response = httpx.post(
            _URL.format(voice_id=config.ELEVENLABS_VOICE_ID),
            params={"output_format": "mp3_44100_128"},
            headers={"xi-api-key": config.ELEVENLABS_API_KEY},
            json={"text": text, "model_id": config.ELEVENLABS_MODEL_ID or _DEFAULT_MODEL},
            timeout=15,
        )
        response.raise_for_status()
        return response.content
    except httpx.HTTPError as error:
        # Never break the demo because of the voice: fall back to the browser voice.
        print(f"ElevenLabs failed, using browser voice instead: {error}")
        return None
