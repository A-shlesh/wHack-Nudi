#!/usr/bin/env bash
# Starts the Nudi helper (the backend) in one step, on macOS or Linux.
#
# What it does:
#   1. checks that Python 3.11 or newer is installed
#   2. creates backend/.venv the first time, and installs what Nudi needs
#   3. creates backend/.env from .env.example if it does not exist yet
#      (no keys needed: without them Nudi uses its own offline rules)
#   4. starts the helper on port 8787 and prints the links to open
#
# Run:    ./start.sh
# Phone:  ./start.sh --lan   (lets a phone on the same Wi-Fi open the family dashboard)

set -e
cd "$(dirname "$0")/backend"
PORT="${NUDI_PORT:-8787}"  # change with NUDI_PORT=8790 ./start.sh (the extension expects 8787)

# ---- 1. Python ----
PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"; then
    PYTHON="$candidate"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "Python 3.11 or newer is needed. Install it from https://www.python.org/downloads/ and run this again."
  exit 1
fi
echo ">> Using $($PYTHON --version)"

# ---- 2. Virtual environment and packages ----
if [ ! -x .venv/bin/python ]; then
  echo ">> Creating backend/.venv (first time only)"
  "$PYTHON" -m venv .venv
fi
echo ">> Installing what Nudi needs (quick after the first time)"
.venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements-dev.txt

# ---- 3. Settings file ----
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created backend/.env. Optional: add Gemini or Groq keys there for smarter answers."
fi

# ---- 4. Start ----
LISTEN="127.0.0.1"
PHONE_LINK=""
if [ "$1" = "--lan" ]; then
  LISTEN="0.0.0.0"
  IP="$( (ipconfig getifaddr en0 2>/dev/null) || (hostname -I 2>/dev/null | awk '{print $1}') || true)"
  [ -n "$IP" ] && PHONE_LINK="http://$IP:$PORT/dashboard/"
fi

echo
echo "Nudi helper is starting. Keep this window open."
echo "  Check it:          http://localhost:$PORT/health"
echo "  Demo bill page:    http://localhost:$PORT/demo/"
echo "  Demo scam page:    http://localhost:$PORT/demo/bescom-scam.html"
echo "  Family dashboard:  http://localhost:$PORT/dashboard/"
[ -n "$PHONE_LINK" ] && echo "  On your phone:     $PHONE_LINK  (same Wi-Fi)"
echo "Press Ctrl+C to stop."
echo

exec .venv/bin/python -m uvicorn app.main:app --host "$LISTEN" --port "$PORT"
