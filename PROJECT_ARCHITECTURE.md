# 專案架構與依賴關係總覽

## 類別與技術棧
- 後端：FastAPI + SQLModel/SQLAlchemy，JWT 驗證 (python-jose) + bcrypt 密碼雜湊，輕量 SQLite 預設。
- 前端：React + TypeScript + Vite，Zustand 狀態管理，Tailwind 風格，遊戲核心邏輯自製 (lib/engine.ts)。
- 部署/設定：`.env` 透過 pydantic-settings 載入，CORS 白名單由環境變數決定，靜態上傳檔案掛載在 `/uploads`。

## 目錄速覽
- backend/app
  - config.py：環境設定 (app_name、db_url、cors_origins、jwt_*、upload_dir)。
  - db.py：`engine` 建立、`init_db()` 建表 + SQLite 輕量 migration、`get_session()` 依賴注入。
  - models.py：SQLModel 資料表 (User、Match、MatchPlayer、MatchStep、LeaderboardEntry/Replay、BlogPost/Comment/Vote 等)。
  - schemas.py：Pydantic 模型 (Leaderboard、Match、User、Profile、Blog 等請求/回應)。
  - main.py：FastAPI app 建立、CORS、/uploads 靜態、路由掛載、啟動事件呼叫 `init_db()`。
  - routes/
    - auth.py：註冊/登入/取得目前使用者，JWT 簽發與驗證，bcrypt 密碼雜湊。
    - match.py：對戰流程 (建立、加入、準備、開始、送步驟、結束、離開/刪除、歷史/最近清單、狀態查詢、步驟清單)。含逾時判定、勝負排名、主持人選擇。
    - leaderboard.py：排行榜查詢/提交，Top10 要求回放，回放 JSON 儲存與讀取。
    - profile.py：個人戰績、最佳成績、積分排行榜 (以名次計分)，使用 match 模組排名邏輯。
    - blog.py：部落格 CRUD、留言、投票、圖片上傳 (型別/大小限制 2MB)。

- frontend/src
  - types.ts：所有前端資料模型定義，需與後端 schema 同步 (命名/欄位 safe_start 等大小寫變化需注意)。
  - lib/engine.ts：踩地雷核心邏輯 (隨機/種子棋盤、首次點擊保護、連鎖揭露、Chord、勝負判定、剩餘地雷計算)。
  - state/gameStore.ts：Zustand store，封裝 board state 與動作 (reveal/toggleFlag/chord + setDifficulty/startFresh)。
  - components/Board.tsx / Cell.tsx：棋盤與格子呈現，事件委派給 store 動作。
  - services/api.ts：所有 HTTP 呼叫；負責 token header、欄位轉換 (safe_start/safeStart)、錯誤訊息。
  - App.tsx：主要 UI/流程：
    - 模式切換 (solo/versus/profile/rank/blog)、主題/檢視偏好 localStorage 持久化。
    - Solo：本地遊戲 + 回放記錄 (soloReplaySteps)。
    - Versus：與後端互動的對戰流程 (建立/加入/準備/開始/步驟/結束/觀戰/回放/最近對局)，並處理 token 儲存 VS_SESSION_KEY。
    - Profile/Rank：個人成績與排行榜資料載入。
    - Blog：文章列表/詳細/投票/留言/上傳圖片；支援 Markdown + KaTeX。
    - Leaderboard：送出成績與回放上傳，讀取排行榜/回放。
  - main.tsx / index.css：入口與全域樣式、主題色系。

## 重要資料流與依賴提醒
### 後端
- JWT/使用者：auth.py 以 `sub` 存 user id，所有需要登入的路由依賴 `get_current_user`；密碼長度 >72 bytes 會被拒絕。
- DB/Migration：`init_db()` 建表後在 SQLite 執行輕量 ALTER (新增 countdown_secs/ready/progress/user_id/handle/last_active_at 等欄位)。修改資料表時需同步 models + migrate 邏輯。
- 比賽流程：
  - 建立/加入時會阻擋使用者同時在多場未結束比賽 (`_active_session_for_user`)。
  - 主持人 = 最早加入玩家；開局需 >=2 人且 pending 狀態。
  - 逾時：`IDLE_MINUTES=10` 無活動則自動終局；active 狀態超過 countdown 秒會結束並計算排名。
  - 步驟序號：`MatchStep.seq` 以 DB 取最後序號 +1，若修改步驟寫入邏輯要維持序列。
  - 結束：`finish` 若沒有完成棋盤卻宣告 win 會被改為 forfeit；所有玩家回報後才結束並依揭露數/時間/步數計算排名。
  - safe_start：由 `match.seed` 決定；前後端皆需一致 (engine 初次揭露若無地雷時才佈雷)。
- 排行榜/回放：Top10 需提供回放，儲存為 JSON (board_json/steps_json)；schema 變更需同步序列化/反序列化。
- 部落格：上傳檔案僅允許指定 MIME/副檔名且 <=2MB；刪除文章會連帶刪除留言/投票。

### 前端
- 型別同步：types.ts 與後端 schema 欄位需一致，特別是 `safe_start` vs `safeStart`、`duration_ms`/`time_ms` 等命名。
- 狀態來源：
  - Solo 模式完全本地；VS 模式依後端 state 驅動，Zustand board 需依 match.board 配置。
  - VS session 會存 localStorage `VS_SESSION_KEY`；切換模式會重設/套用棋盤設定。
- API 行為：services/api.ts 封裝 fetch，所有錯誤需處理 `res.ok`；修改路由或欄位時記得同步這層轉換。
- 遊戲引擎：`reveal` 首次點擊才佈雷並記錄開始時間；`chordReveal` 需旗數匹配；`createEmptyState` 允許自訂尺寸/種子/safeStart。
- UI/安全：Markdown 透過 DOMPurify 清理；KaTeX 已載入 CSS；部落格圖片使用 `/uploads` 取檔。

## 常見修改指引
- 新增/修改 API：
  1) 更新 backend 的 schema (schemas.py) 與路由；
  2) 如有 DB 欄位，調整 models.py 並在 db.py 的 `_run_light_migrations()` 添加 SQLite ALTER；
  3) 同步 frontend 的 types.ts 與 services/api.ts；
  4) 若回應影響 UI 流程，檢查 App.tsx 對應的狀態/效果。

- 調整對戰邏輯：
  - 確保 `_active_session_for_user`、`_apply_timeout`、`_compute_standings` 仍符合新規則。
  - 若新增玩家狀態欄位，需在 MatchStatePlayer、MatchState、前端 MatchState/MatchSession 型別與 UI 呈現同步。
  - 任何計時/倒數改動需同步前端格式化 (formatCountdown) 及顯示邏輯。

- 修改排行榜/回放：
  - 變更 replay 結構時需更新 LeaderboardReplayUpload/Read、序列化 json dumps/loads，以及前端回放解析 (App.tsx、services/api.ts、types.ts)。

- 部落格/上傳：
  - 調整檔案限制時同步後端 blog.upload_image 與前端錯誤訊息。
  - 若改動投票規則，需更新 `_stats_for_posts` 計算與前端 `my_vote` 呈現。

- UI/樣式：
  - 主題變數在 src/index.css；新增主題需更新 THEME_OPTIONS 與 CSS 自訂屬性。
  - 棋盤尺寸計算在 Board.tsx，影響 RWD。

## 環境與啟動
- 後端：安裝 requirements.txt，`uvicorn backend.app.main:app --reload` 或使用 `run_backend.sh` / `start_backend.sh`。
- 前端：`npm install` 後 `npm run dev`，預設連線 API_BASE http://localhost:8000 (可用 VITE_API_BASE 覆寫)。
- .env 範例：
  - DB：`db_url=sqlite:///./minesweeper.db`
  - CORS：`cors_origins=http://localhost:5173`
  - JWT：`jwt_secret=...`、`jwt_expires_minutes=1440`
  - 上傳：`upload_dir=./uploads`

## 變更檢查清單
- Schema/欄位是否前後端一致？(types.ts, services/api.ts, schemas.py)
- DB 欄位是否加入輕量 migration？(db.py)
- 欄位命名 (snake/camel) 是否在 API 轉換層處理？
- 逾時/倒數/排名邏輯是否影響前端倒數顯示與結果呈現？
- 回放/步驟序列是否保持相容 (seq、safe_start、steps_json)？
- 認證路由是否仍要求 Bearer token；前端是否正確帶入？
- 新增檔案型別/限制是否同步後端驗證與前端提示？
