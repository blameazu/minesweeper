#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/backend"

PY_BIN=""
if [ -x ../.venv/bin/python ]; then
    PY_BIN="../.venv/bin/python"
elif [ -x ../.venv/Scripts/python.exe ]; then
    PY_BIN="../.venv/Scripts/python.exe"
elif [ -x ../.venv/Scripts/python ]; then
    PY_BIN="../.venv/Scripts/python"
elif command -v python3 >/dev/null 2>&1; then
    PY_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PY_BIN="python"
fi

if [ -z "$PY_BIN" ]; then
    echo "python not found; please install or activate a venv"
    exit 1
fi

"$PY_BIN" - <<'PY'
from sqlmodel import Session
from sqlalchemy import text
from app.db import engine

with Session(engine) as s:
    s.exec(text("DELETE FROM user;"))
    try:
        s.exec(text("DELETE FROM sqlite_sequence WHERE name = 'user';"))
    except Exception as e:
        print("sqlite_sequence reset skipped:", e)
    s.commit()
print("cleared all users (accounts/passwords)")
PY
