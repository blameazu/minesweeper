#!/usr/bin/env bash
set -euo pipefail

# One-shot launcher: kills old uvicorn, starts backend, then starts ngrok.
# Usage (from repo root or backend folder):
#   bash backend/start_backend.sh
# Optional: export NGROK_DOMAIN="your-domain.ngrok-free.dev" before running.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON_WIN="../.venv/Scripts/python.exe"
if [[ ! -x "$PYTHON_WIN" ]]; then
  echo "Python venv not found at $PYTHON_WIN. Create it or adjust the path in start_backend.sh." >&2
  exit 1
fi

# Stop any running uvicorn on port 8000 (WSL side)
pkill -f "uvicorn app.main:app" 2>/dev/null || true

# Ensure logs dir exists
mkdir -p logs

# Start uvicorn in background and clean it up on exit
$PYTHON_WIN -m uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  > logs/uvicorn.log 2>&1 &
UVICORN_PID=$!
cleanup() { kill "$UVICORN_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "uvicorn started (pid $UVICORN_PID), logs: backend/logs/uvicorn.log"

# Start ngrok (requires ngrok in PATH). Use NGROK_DOMAIN if provided.
NGROK_DOMAIN=${NGROK_DOMAIN:-pseudocolumellar-breana-nonsulphurous.ngrok-free.dev}
echo "starting ngrok for http://localhost:8000 with domain: $NGROK_DOMAIN"
ngrok http 8000 --domain "$NGROK_DOMAIN"
