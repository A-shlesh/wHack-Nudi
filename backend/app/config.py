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

# --- AWS Bedrock (the AI model that simplifies pages) ---
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "")

# Bedrock can be used with normal AWS keys or with a Bedrock API key.
_has_aws_keys = bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"))
_has_bedrock_key = bool(os.getenv("AWS_BEARER_TOKEN_BEDROCK"))
USE_REAL_BEDROCK = bool(BEDROCK_MODEL_ID) and (_has_aws_keys or _has_bedrock_key)

# --- ElevenLabs (natural voice) ---
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")
ELEVENLABS_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "")
USE_REAL_ELEVENLABS = bool(ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID)
