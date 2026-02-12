#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/backend"

# Pick python interpreter without sourcing (avoids CRLF issues on Windows venv).
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

tables = ['matchstep', 'matchplayer', '"match"', 'leaderboardentry']
with Session(engine) as s:
    for t in tables:
        s.exec(text(f"DELETE FROM {t};"))
    try:
        s.exec(text("DELETE FROM sqlite_sequence WHERE name in ('matchstep','matchplayer','match','leaderboardentry');"))
    except Exception as e:
        print("sqlite_sequence reset skipped:", e)
    s.commit()
print("cleared leaderboard and match records")
PY