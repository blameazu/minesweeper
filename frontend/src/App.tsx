import { useEffect, useMemo, useState } from "react";
import { Board } from "./components/Board";
import { useGameStore } from "./state/gameStore";
import { difficultiesList, remainingMines } from "./lib/engine";
import type { DifficultyKey, LeaderboardEntry } from "./types";
import { fetchLeaderboard, submitScore } from "./services/api";

const formatMs = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "--";
  return (ms / 1000).toFixed(2);
};

function App() {
  const { board, setDifficulty, startFresh, revealCell, toggleFlag, chordCell } = useGameStore();
  const [now, setNow] = useState(Date.now());
  const [player, setPlayer] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLb, setLoadingLb] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

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

  const handleDifficulty = (key: DifficultyKey) => {
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

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 text-[var(--text-primary)]">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">踩地雷</h1>
          <p className="text-sm opacity-80">單人模式（首擊保護）</p>
        </div>
        <div className="flex gap-2 items-center">
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
            onClick={() => startFresh()}
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
            <Board board={board} onReveal={revealCell} onFlag={toggleFlag} onChord={chordCell} />
          </div>
        </div>

        <div className="space-y-4">
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
              <h2 className="text-lg font-semibold">排行榜</h2>
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
        </div>
      </section>
    </div>
  );
}

export default App;
