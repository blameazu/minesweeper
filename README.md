# Minesweeper Web App

雙端專案：
- 前端：Vite + React + TypeScript + Tailwind（靜態佈署到 GitHub Pages）
- 後端：Python FastAPI + SQLModel + SQLite（本機啟動）

## 快速開始

### 前端
1. 安裝依賴：`cd frontend && npm install`
2. 開發伺服器：`npm run dev`
3. 建置：`npm run build`
4. 本地預覽：`npm run preview`

### 後端
1. 建立虛擬環境並安裝：
   ```bash
   cd backend
   python -m venv .venv
   .venv\\Scripts\\activate  # Windows CMD/PowerShell
   source .venv/bin/activate  # WSL/Linux/macOS
   pip install -r requirements.txt
   ```
2. 啟動 API：`uvicorn app.main:app --reload`

## 架構摘要
- `frontend/`: 單頁應用，含踩地雷邏輯、計時器、排行榜介面
- `backend/`: FastAPI，提供遊戲建立、排行榜、WebSocket 骨架
- `.github/workflows/frontend.yml`: 自動建置並佈署到 gh-pages

## 功能（MVP）
- 單人模式：初階/中階/高階/自訂，首擊不踩雷
- 計時與完成判定，送出成績到排行榜
- 排行榜：依難度列出最佳時間
- 預留雙人模式 API/WebSocket 骨架

## 部署
- 前端：推送到 main；GitHub Actions 會建置並發佈到 gh-pages 分支，設定 GitHub Pages 指向 gh-pages
- 後端：本機啟動；之後可改 Docker 或雲端

## 測試
- 前端：`npm run test`（Vitest）
- 後端：`pytest`（含 httpx/pytest-asyncio）

