import { useEffect, useMemo, useState } from "react";
import { Board } from "./components/Board";
import { useGameStore } from "./state/gameStore";
import { difficultiesList, remainingMines } from "./lib/engine";
import type { DifficultyKey, LeaderboardEntry, MatchSession, MatchState, MatchStep } from "./types";
import {
  createMatch,
  fetchLeaderboard,
  fetchMatchState,
  fetchMatchSteps,
  finishMatch,
  joinMatch,
  sendMatchStep,
  submitScore
} from "./services/api";

const formatMs = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "--";
  return (ms / 1000).toFixed(2);
};

function App() {
  const { board, setDifficulty, startFresh, revealCell, toggleFlag, chordCell } = useGameStore();
  const [mode, setMode] = useState<"solo" | "versus">("solo");
  const [now, setNow] = useState(Date.now());
  const [player, setPlayer] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLb, setLoadingLb] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [vsName, setVsName] = useState("");
  const [vsMatch, setVsMatch] = useState<MatchSession | null>(null);
  const [vsState, setVsState] = useState<MatchState | null>(null);
  const [vsSteps, setVsSteps] = useState<MatchStep[]>([]);
  const [vsError, setVsError] = useState<string | null>(null);
  const [vsInfo, setVsInfo] = useState<string | null>(null);
  const [joinId, setJoinId] = useState("");
  const [vsStepCount, setVsStepCount] = useState(0);

  useEffect(() => {
    if (board.startedAt && !board.endedAt) {
      const t = setInterval(() => setNow(Date.now()), 100);
      return () => clearInterval(t);
    }
  }, [board.startedAt, board.endedAt]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const elapsedMs = useMemo(() => {
    if (!board.startedAt) return 0;
    const end = board.endedAt ?? now;
    return Math.max(0, end - board.startedAt);
  }, [board.startedAt, board.endedAt, now]);

  const statusText = useMemo(() => {
    if (board.status === "won") return "你贏了！";
    if (board.status === "lost") return "踩到雷 QQ";
    return "進行中";
  }, [board.status]);

  const loadLeaderboard = async (difficulty: DifficultyKey) => {
    try {
      setLoadingLb(true);
      setError(null);
      const data = await fetchLeaderboard(difficulty);
      setLeaderboard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取失敗");
    } finally {
      setLoadingLb(false);
    }
  };

  useEffect(() => {
    loadLeaderboard(board.difficulty);
  }, [board.difficulty]);

  useEffect(() => {
    if (mode !== "versus" || !vsMatch) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const state = await fetchMatchState(vsMatch.matchId);
        if (cancelled) return;
        setVsState(state);
        setVsMatch((m) => (m ? { ...m, status: state.status } : m));
        if (state.status === "finished" && vsSteps.length === 0) {
          const steps = await fetchMatchSteps(vsMatch.matchId);
          if (!cancelled) setVsSteps(steps);
        }
      } catch (err) {
        if (!cancelled) setVsError(err instanceof Error ? err.message : "對局狀態讀取失敗");
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode, vsMatch?.matchId, vsSteps.length]);

  const handleDifficulty = (key: DifficultyKey) => {
    if (mode === "versus") {
      setVsError("對戰中不可切換難度");
      return;
    }
    setDifficulty(key);
  };

  const handleSubmit = async () => {
    if (board.status !== "won" || !board.endedAt || !board.startedAt) return;
    if (!player.trim()) {
      setError("請填寫暱稱");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await submitScore({ player: player.trim(), difficulty: board.difficulty, timeMs: elapsedMs });
      await loadLeaderboard(board.difficulty);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const applyBoardConfig = (config: { width: number; height: number; mines: number; seed: string }) => {
    setDifficulty("custom", { width: config.width, height: config.height, mines: config.mines, seed: config.seed });
  };

  const handleCreateMatch = async () => {
    if (!vsName.trim()) {
      setVsError("請輸入暱稱");
      return;
    }
    try {
      setVsError(null);
      setVsInfo("建立中...");
      const cfg = { width: board.width, height: board.height, mines: board.mines, seed: board.seed };
      const session = await createMatch({
        player: vsName.trim(),
        width: cfg.width,
        height: cfg.height,
        mines: cfg.mines,
        seed: cfg.seed,
        difficulty: board.difficulty
      });
      setVsMatch({ ...session, status: "pending" });
      setVsState(null);
      setVsSteps([]);
      setVsStepCount(0);
      applyBoardConfig(session.board);
      setVsInfo(`已建立對局，分享 ID: ${session.matchId}`);
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "建立失敗");
    }
  };

  const handleJoinMatch = async () => {
    const idNum = Number(joinId);
    if (!joinId || Number.isNaN(idNum)) {
      setVsError("請輸入有效的對局 ID");
      return;
    }
    if (!vsName.trim()) {
      setVsError("請輸入暱稱");
      return;
    }
    try {
      setVsError(null);
      setVsInfo("加入中...");
      const session = await joinMatch(idNum, { player: vsName.trim() });
      setVsMatch(session);
      setVsState(null);
      setVsSteps([]);
      setVsStepCount(0);
      applyBoardConfig(session.board);
      setVsInfo(`已加入對局 #${session.matchId}`);
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "加入失敗");
    }
  };

  const sendStepIfNeeded = async (action: "reveal" | "flag" | "chord", x: number, y: number, nextStepCount: number) => {
    if (mode !== "versus" || !vsMatch) return;
    try {
      await sendMatchStep(vsMatch.matchId, {
        playerToken: vsMatch.playerToken,
        action,
        x,
        y,
        elapsed_ms: elapsedMs
      });
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "送出步驟失敗");
    }
    setVsStepCount(nextStepCount);
  };

  const finishIfNeeded = async () => {
    if (mode !== "versus" || !vsMatch) return;
    const current = useGameStore.getState().board;
    if (current.status === "won" || current.status === "lost") {
      try {
        await finishMatch(vsMatch.matchId, {
          playerToken: vsMatch.playerToken,
          outcome: current.status === "won" ? "win" : "lose",
          duration_ms: elapsedMs,
          steps_count: vsStepCount
        });
        setVsMatch({ ...vsMatch, status: current.status === "won" ? "finished" : vsMatch.status });
        setVsInfo(current.status === "won" ? "你完成了！" : "你踩雷了");
      } catch (e) {
        setVsError(e instanceof Error ? e.message : "結束對局失敗");
      }
    }
  };

  const handleReveal = async (x: number, y: number) => {
    if (mode === "versus" && vsMatch?.status === "finished") return;
    revealCell(x, y);
    const nextCount = vsStepCount + 1;
    await sendStepIfNeeded("reveal", x, y, nextCount);
    await finishIfNeeded();
  };

  const handleFlag = async (x: number, y: number) => {
    if (mode === "versus" && vsMatch?.status === "finished") return;
    toggleFlag(x, y);
    const nextCount = vsStepCount + 1;
    await sendStepIfNeeded("flag", x, y, nextCount);
    await finishIfNeeded();
  };

  const handleChord = async (x: number, y: number) => {
    if (mode === "versus" && vsMatch?.status === "finished") return;
    chordCell(x, y);
    const nextCount = vsStepCount + 1;
    await sendStepIfNeeded("chord", x, y, nextCount);
    await finishIfNeeded();
  };

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 text-[var(--text-primary)]">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">踩地雷</h1>
          <p className="text-sm opacity-80">{mode === "solo" ? "單人模式（首擊保護）" : "對戰模式（同圖同步）"}</p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setMode("solo")}
            className={`px-3 py-2 rounded-full text-sm border ${
              mode === "solo" ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface-strong)] border-[var(--border)]"
            }`}
          >
            單人
          </button>
          <button
            onClick={() => setMode("versus")}
            className={`px-3 py-2 rounded-full text-sm border ${
              mode === "versus" ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface-strong)] border-[var(--border)]"
            }`}
          >
            對戰
          </button>
          {difficultiesList.map((d) => (
            <button
              key={d.key}
              onClick={() => handleDifficulty(d.key)}
              className={`px-3 py-2 rounded-full text-sm border ${
                board.difficulty === d.key
                  ? "bg-[var(--accent)] text-white border-transparent"
                  : "bg-[var(--surface-strong)] border-[var(--border)]"
              }`}
            >
              {d.label}
            </button>
          ))}
          <button
            onClick={() => {
              if (mode === "versus") {
                setVsError("對戰中不可重新洗盤");
                return;
              }
              startFresh();
            }}
            className="px-3 py-2 rounded-full text-sm border bg-[var(--accent-strong)] text-white border-transparent"
          >
            重新開始
          </button>
          <button
            onClick={toggleTheme}
            className="px-3 py-2 rounded-full text-sm border bg-[var(--surface-strong)] border-[var(--border)]"
            aria-label="切換主題"
          >
            {theme === "light" ? "🌙 暗色" : "☀️ 亮色"}
          </button>
        </div>
      </header>

      <section className="grid md:grid-cols-[auto,320px] gap-8 items-start justify-center">
        <div className="space-y-3 flex flex-col items-center">
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-lg bg-[var(--surface)] shadow border border-[var(--border)]">
              <div className="text-xs opacity-70">計時</div>
              <div className="text-2xl font-mono">{formatMs(elapsedMs)} s</div>
            </div>
            <div className="px-4 py-2 rounded-lg bg-[var(--surface)] shadow border border-[var(--border)]">
              <div className="text-xs opacity-70">剩餘雷</div>
              <div className="text-2xl font-mono">{remainingMines(board)}</div>
            </div>
            <div className="px-4 py-2 rounded-lg bg-[var(--surface)] shadow border border-[var(--border)]">
              <div className="text-xs opacity-70">狀態</div>
              <div className="text-lg font-semibold">{statusText}</div>
            </div>
          </div>

          <div className="w-max">
            <Board board={board} onReveal={handleReveal} onFlag={handleFlag} onChord={handleChord} />
          </div>
        </div>

        <div className="space-y-4">
          {mode === "solo" ? (
            <>
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                <h2 className="text-lg font-semibold">送出成績</h2>
                <input
                  value={player}
                  onChange={(e) => setPlayer(e.target.value)}
                  placeholder="輸入暱稱"
                  className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
                />
                <button
                  onClick={handleSubmit}
                  disabled={board.status !== "won" || submitting}
                  className="w-full rounded bg-[var(--accent-strong)] text-white py-2 disabled:opacity-50"
                >
                  {submitting ? "送出中..." : "送出排行榜"}
                </button>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>

              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">排行榜 (前 10 名)</h2>
                  <span className="text-xs opacity-70">{board.difficulty}</span>
                </div>
                {loadingLb ? (
                  <p className="text-sm opacity-70">載入中...</p>
                ) : leaderboard.length === 0 ? (
                  <p className="text-sm opacity-70">暫無成績</p>
                ) : (
                  <ol className="space-y-2">
                    {leaderboard.map((entry, i) => (
                      <li key={entry.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs opacity-70 w-6">#{i + 1}</span>
                          <span className="font-medium">{entry.player}</span>
                        </div>
                        <div className="font-mono text-sm">{formatMs(entry.timeMs)} s</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                <h2 className="text-lg font-semibold">對戰設定</h2>
                <input
                  value={vsName}
                  onChange={(e) => setVsName(e.target.value)}
                  placeholder="輸入暱稱"
                  className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCreateMatch}
                    className="w-full rounded bg-[var(--accent-strong)] text-white py-2"
                  >
                    建立對局
                  </button>
                  <button
                    onClick={handleJoinMatch}
                    className="w-full rounded bg-[var(--surface-strong)] border border-[var(--border)] py-2"
                  >
                    加入對局
                  </button>
                </div>
                <input
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  placeholder="輸入對局 ID"
                  className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
                />
                {vsInfo && <p className="text-sm text-green-600">{vsInfo}</p>}
                {vsError && <p className="text-sm text-red-600">{vsError}</p>}
              </div>

              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">對戰狀態</h2>
                  <span className="text-xs opacity-70">{vsMatch ? `#${vsMatch.matchId}` : "尚未加入"}</span>
                </div>
                {!vsMatch ? (
                  <p className="text-sm opacity-70">建立或加入一場對局</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p>狀態：{vsMatch.status}</p>
                    <p>
                      棋盤：{vsMatch.board.width}x{vsMatch.board.height}，雷 {vsMatch.board.mines}
                    </p>
                    {vsState && (
                      <div className="space-y-1">
                        {vsState.players.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-sm">
                            <span>{p.name}</span>
                            <span className="opacity-70">{p.result ?? "進行中"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {vsMatch && vsState?.status === "finished" && (
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                  <h2 className="text-lg font-semibold">對戰步驟</h2>
                  {vsSteps.length === 0 ? (
                    <p className="text-sm opacity-70">載入中...</p>
                  ) : (
                    <ol className="space-y-2 max-h-64 overflow-auto text-sm font-mono">
                      {vsSteps.map((s, idx) => (
                        <li key={`${idx}-${s.created_at}`} className="flex justify-between">
                          <span className="opacity-70">#{s.seq ?? idx + 1}</span>
                          <span>{s.player_name}</span>
                          <span>{s.action} ({s.x},{s.y})</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;
