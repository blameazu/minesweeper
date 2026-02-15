#!/usr/bin/env bash
set -euo pipefail

# 快速開發環境啟動腳本 (WSL)
# Usage: ./run_backend.sh

cd "$(dirname "$0")"
VENV=".venv-wsl"
PORT=8000

# 檢查 PORT 是否被占用
if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "Port ${PORT} 已被佔用，請先停止使用該 port 的進程。" >&2
  exit 1
fi

# 創建虛擬環境並安裝套件（只做一次）
if [ ! -d "$VENV" ]; then
  echo "建立虛擬環境並安裝套件..."
  python3 -m venv "$VENV"
  "$VENV/bin/python" -m pip install --upgrade pip
  "$VENV/bin/python" -m pip install -r requirements.txt aiofiles python-multipart
fi

# 啟動後端 (開發模式可加 --reload)
echo "啟動後端服務..."
exec "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port "$PORT" --workers 1
