#!/usr/bin/env bash
set -euo pipefail

# Simple one-shot launcher for the backend in WSL
# Usage: ./run_backend.sh

cd "$(dirname "$0")"
VENV=".venv-wsl"
PORT=8000

if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "Port ${PORT} is already in use. Stop the process using it and rerun." >&2
  exit 1
fi

if [ ! -d "$VENV" ]; then
  python3 -m venv "$VENV"
fi

"$VENV/bin/python" -m pip install --disable-pip-version-check -r requirements.txt aiofiles python-multipart >/dev/null

exec "$VENV/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
