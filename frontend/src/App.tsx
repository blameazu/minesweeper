import { useEffect, useMemo, useState } from "react";
import { Board } from "./components/Board";
import { useGameStore } from "./state/gameStore";
import { difficultiesList, remainingMines } from "./lib/engine";
import type { DifficultyKey, LeaderboardEntry, MatchSession, MatchState, MatchProgress, BoardState, RecentMatch } from "./types";
import {
  createMatch,
  fetchLeaderboard,
  fetchMatchState,
  fetchRecentMatches,
  finishMatch,
  joinMatch,
  setReady,
  sendMatchStep,
  submitScore
} from "./services/api";

const formatMs = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "--";
  return (ms / 1000).toFixed(2);
};

const formatCountdown = (secs: number | null | undefined) => {
  if (secs === null || secs === undefined || Number.isNaN(secs)) return "--:--";
  const m = Math.floor(secs / 60);
  const s = Math.max(0, secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  const [vsError, setVsError] = useState<string | null>(null);
  const [vsInfo, setVsInfo] = useState<string | null>(null);
  const [joinId, setJoinId] = useState("");
  const [vsStepCount, setVsStepCount] = useState(0);
  const [vsProgressUploaded, setVsProgressUploaded] = useState(false);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [recentError, setRecentError] = useState<string | null>(null);

  useEffect(() => {
    const shouldTick = (board.startedAt && !board.endedAt) || (mode === "versus" && vsState?.status === "active");
    if (!shouldTick) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [mode, board.startedAt, board.endedAt, vsState?.status]);

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

  const myPlayer = useMemo(() => {
    if (!vsMatch || !vsState) return null;
    return vsState.players.find((p) => p.id === vsMatch.playerId) ?? null;
  }, [vsMatch, vsState]);

  const opponent = useMemo(() => {
    if (!vsState || !vsMatch) return null;
    return vsState.players.find((p) => p.id !== vsMatch.playerId) ?? null;
  }, [vsState, vsMatch]);

  const countdownDeadline = useMemo(() => {
    if (!vsState?.started_at) return null;
    return new Date(vsState.started_at).getTime() + (vsState.countdown_secs ?? 0) * 1000;
  }, [vsState?.started_at, vsState?.countdown_secs]);

  const countdownLeft = useMemo(() => {
    if (!countdownDeadline) return null;
    return Math.max(0, Math.floor((countdownDeadline - now) / 1000));
  }, [countdownDeadline, now]);

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
  }, [mode, vsMatch?.matchId]);

  useEffect(() => {
    if (mode !== "versus") return;
    let cancelled = false;
    const loadRecent = async () => {
      try {
        const data = await fetchRecentMatches();
        if (!cancelled) {
          setRecentMatches(data);
          setRecentError(null);
        }
      } catch (e) {
        if (!cancelled) setRecentError(e instanceof Error ? e.message : "讀取最近對戰失敗");
      }
    };
    loadRecent();
    const id = setInterval(loadRecent, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  useEffect(() => {
    if (!vsMatch || !vsState) return;
    if (vsState.status !== "finished") {
      setVsProgressUploaded(false);
      return;
    }
    if (vsProgressUploaded) return;
    if (myPlayer?.progress) {
      setVsProgressUploaded(true);
      return;
    }

    const snapshot = useGameStore.getState().board;
    const outcome = myPlayer?.result ?? "draw";
    finishMatch(vsMatch.matchId, {
      playerToken: vsMatch.playerToken,
      outcome: outcome as "win" | "lose" | "draw" | "forfeit",
      steps_count: myPlayer?.steps_count ?? vsStepCount,
      duration_ms: myPlayer?.duration_ms ?? undefined,
      progress: { board: snapshot }
    }).finally(() => setVsProgressUploaded(true));
  }, [myPlayer, vsMatch, vsProgressUploaded, vsState, vsStepCount]);

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

  const getProgressBoard = (progress?: MatchProgress | null): BoardState | null => {
    const boardSnapshot = progress?.board as BoardState | undefined;
    if (!boardSnapshot || !Array.isArray(boardSnapshot.cells)) return null;
    return boardSnapshot;
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
      setVsStepCount(0);
      setVsProgressUploaded(false);
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
      setVsStepCount(0);
      setVsProgressUploaded(false);
      applyBoardConfig(session.board);
      setVsInfo(`已加入對局 #${session.matchId}`);
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "加入失敗");
    }
  };

  const handleSetReady = async () => {
    if (!vsMatch) {
      setVsError("尚未加入對局");
      return;
    }
    try {
      setVsError(null);
      setVsInfo("等待對手準備...");
      await setReady(vsMatch.matchId, { playerToken: vsMatch.playerToken, ready: true });
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "設定準備失敗");
    }
  };

  const sendStepIfNeeded = async (action: "reveal" | "flag" | "chord", x: number, y: number, nextStepCount: number) => {
    if (mode !== "versus" || !vsMatch) return;
    if (!vsState || vsState.status !== "active") {
      setVsError("雙方尚未準備，無法操作");
      return;
    }
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
          steps_count: vsStepCount,
          progress: { board: current }
        });
        setVsMatch({ ...vsMatch, status: "finished" });
        setVsInfo(current.status === "won" ? "你完成了！" : "你踩雷了");
      } catch (e) {
        setVsError(e instanceof Error ? e.message : "結束對局失敗");
      }
    }
  };

  const handleReveal = async (x: number, y: number) => {
    if (mode === "versus") {
      if (vsMatch?.status === "finished") return;
      if (!vsState || vsState.status !== "active") {
        setVsError("對局尚未開始");
        return;
      }
    }
    revealCell(x, y);
    const nextCount = vsStepCount + 1;
    await sendStepIfNeeded("reveal", x, y, nextCount);
    await finishIfNeeded();
  };

  const handleFlag = async (x: number, y: number) => {
    if (mode === "versus") {
      if (vsMatch?.status === "finished") return;
      if (!vsState || vsState.status !== "active") {
        setVsError("對局尚未開始");
        return;
      }
    }
    toggleFlag(x, y);
    const nextCount = vsStepCount + 1;
    await sendStepIfNeeded("flag", x, y, nextCount);
    await finishIfNeeded();
  };

  const handleChord = async (x: number, y: number) => {
    if (mode === "versus") {
      if (vsMatch?.status === "finished") return;
      if (!vsState || vsState.status !== "active") {
        setVsError("對局尚未開始");
        return;
      }
    }
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
          <p className="text-sm opacity-80">{mode === "solo" ? "單人模式（首擊保護）" : "對戰模式（同圖同步／踩雷即敗）"}</p>
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
                  <div className="space-y-3 text-sm">
                    <p>狀態：{vsState?.status ?? vsMatch.status}</p>
                    <p>
                      棋盤：{vsMatch.board.width}x{vsMatch.board.height}，雷 {vsMatch.board.mines}
                    </p>
                    <p>倒數：{vsState?.started_at ? formatCountdown(countdownLeft) : "等待開始"}</p>
                    <div className="space-y-1">
                      {(vsState?.players ?? []).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <span>{p.name}</span>
                          <span className="opacity-70 flex items-center gap-2">
                            <span>{p.ready ? "已準備" : "未準備"}</span>
                            <span>{p.result ?? "進行中"}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleSetReady}
                      disabled={myPlayer?.ready || vsState?.status === "active" || vsState?.status === "finished"}
                      className="w-full rounded bg-[var(--accent-strong)] text-white py-2 disabled:opacity-60"
                    >
                      {myPlayer?.ready ? "已準備" : "我已準備"}
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">最近 10 場</h2>
                  <span className="text-xs opacity-70">含進行中</span>
                </div>
                {recentError ? (
                  <p className="text-sm text-red-600">{recentError}</p>
                ) : recentMatches.length === 0 ? (
                  <p className="text-sm opacity-70">暫無紀錄</p>
                ) : (
                  <ol className="space-y-2 text-sm">
                    {recentMatches.map((m) => (
                      <li key={m.match_id} className="border border-[var(--border)] rounded-lg px-3 py-2 bg-[var(--surface-strong)]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">#{m.match_id}</span>
                          <span className="opacity-70">{m.status}</span>
                        </div>
                        <div className="text-xs opacity-80">
                          {m.width}x{m.height} / {m.mines} 雷
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {m.players.map((p, idx) => (
                            <span
                              key={`${m.match_id}-${idx}-${p.name}`}
                              className="px-2 py-1 rounded-full text-xs border border-[var(--border)] bg-[var(--surface)]"
                            >
                              {p.name}：{p.result ?? "進行中"}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {vsMatch && vsState?.status === "finished" && (
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                  <h2 className="text-lg font-semibold">對戰棋盤</h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {vsState.players.map((p) => {
                      const snap = getProgressBoard(p.progress ?? null);
                      return (
                        <div key={p.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{p.name}</span>
                            <span className="text-sm opacity-80">{p.result ?? "完成"}</span>
                          </div>
                          {snap ? (
                            <Board board={snap} onReveal={() => {}} onFlag={() => {}} onChord={() => {}} />
                          ) : (
                            <p className="text-sm opacity-70">沒有棋盤紀錄</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
