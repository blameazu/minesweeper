import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./components/Board";
import { useGameStore } from "./state/gameStore";
import { difficultiesList, remainingMines, createEmptyState, reveal as replayReveal, toggleFlag as replayToggleFlag, chordReveal as replayChordReveal } from "./lib/engine";
import type {
  DifficultyKey,
  LeaderboardEntry,
  MatchSession,
  MatchState,
  MatchProgress,
  BoardState,
  RecentMatch,
  User,
  ProfileResponse,
  MatchStep
} from "./types";
import {
  createMatch,
  deleteMatch,
  fetchLeaderboard,
  fetchMatchState,
  fetchRecentMatches,
  finishMatch,
  joinMatch,
  leaveMatch,
  setReady,
  startMatch,
  sendMatchStep,
  submitScore,
  login,
  register,
  fetchMe,
  fetchProfile,
  fetchMatchSteps
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

const VS_SESSION_KEY = "vs_session";
const UI_THEME_KEY = "ui_theme";
const UI_VIEW_KEY = "ui_view";
const UI_MODE_KEY = "ui_mode";

const readStored = <T extends string>(key: string, fallback: T, allowed: readonly T[]): T => {
  if (typeof window === "undefined") return fallback;
  const val = localStorage.getItem(key) as T | null;
  return val && allowed.includes(val) ? val : fallback;
};

const parseUtcMillis = (ts?: string | null) => {
  if (!ts) return null;
  const trimmed = ts.trim();
  if (!trimmed) return null;
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const ms = Date.parse(withZone);
  return Number.isNaN(ms) ? null : ms;
};

const applyReplayStep = (state: BoardState, step: MatchStep): BoardState => {
  switch (step.action) {
    case "reveal":
      return replayReveal(state, step.x, step.y);
    case "flag":
      return replayToggleFlag(state, step.x, step.y);
    case "chord":
      return replayChordReveal(state, step.x, step.y);
    default:
      return state;
  }
};

function App() {
  const { board, setDifficulty, startFresh, revealCell, toggleFlag, chordCell } = useGameStore();
  const [mode, setMode] = useState<"solo" | "versus">(() => readStored(UI_MODE_KEY, "solo", ["solo", "versus"]));
  const [view, setView] = useState<"solo" | "versus" | "profile">(() =>
    readStored(UI_VIEW_KEY, "solo", ["solo", "versus", "profile"])
  );
  const [now, setNow] = useState(Date.now());
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authHandle, setAuthHandle] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLb, setLoadingLb] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => readStored(UI_THEME_KEY, "light", ["light", "dark"]));
  const [vsName, setVsName] = useState("");
  const [vsMatch, setVsMatch] = useState<MatchSession | null>(null);
  const [vsState, setVsState] = useState<MatchState | null>(null);
  const vsStateRef = useRef<MatchState | null>(null);
  const vsPrevStatusRef = useRef<string | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [vsError, setVsError] = useState<string | null>(null);
  const [vsInfo, setVsInfo] = useState<string | null>(null);
  const [joinId, setJoinId] = useState("");
  const [spectateId, setSpectateId] = useState("");
  const [vsStepCount, setVsStepCount] = useState(0);
  const [vsProgressUploaded, setVsProgressUploaded] = useState(false);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [selectedResultPlayerId, setSelectedResultPlayerId] = useState<number | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [soloDifficulty, setSoloDifficulty] = useState<DifficultyKey>(board.difficulty);
  const [versusDifficulty, setVersusDifficulty] = useState<DifficultyKey>("beginner");
  const [replayBoard, setReplayBoard] = useState<BoardState | null>(null);
  const [replaySteps, setReplaySteps] = useState<MatchStep[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replaySpeed, setReplaySpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [spectatorViewPlayerId, setSpectatorViewPlayerId] = useState<number | null>(null);
  const [spectatorBoard, setSpectatorBoard] = useState<BoardState | null>(null);
  const [spectatorBoardLoading, setSpectatorBoardLoading] = useState(false);
  const [spectatorBoardError, setSpectatorBoardError] = useState<string | null>(null);

  const isAuthenticated = !!currentUser && !!token;

  const boardForView = useMemo(() => {
    // Main board: show live board; if在觀戰模式則顯示觀戰棋盤，不受回放棋盤干擾。
    if (isSpectator) {
      return spectatorBoard ?? board;
    }
    return board;
  }, [board, isSpectator, spectatorBoard]);

  // Rehydrate versus session after refresh using stored player token/id.
  useEffect(() => {
    const saved = localStorage.getItem(VS_SESSION_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { matchId: number; playerId: number; playerToken: string };
      if (!parsed.matchId || !parsed.playerToken) return;
      setMode("versus");
      setView((v) => (v === "profile" ? "profile" : "versus"));
      setIsSpectator(false);
      setVsMatch({
        matchId: parsed.matchId,
        playerId: parsed.playerId,
        playerToken: parsed.playerToken,
        board: { width: board.width, height: board.height, mines: board.mines, seed: board.seed, safeStart: board.safeStart ?? null },
        status: "pending"
      });
      setVsProgressUploaded(false);
      setVsStepCount(0);
      setSelectedResultPlayerId(null);
      resetReplay();

      fetchMatchState(parsed.matchId)
        .then((state) => {
          applyBoardConfig({
            width: state.width,
            height: state.height,
            mines: state.mines,
            seed: state.seed,
            difficulty: state.difficulty as DifficultyKey | null,
            safe_start: state.safe_start ?? null
          });
          if (state.difficulty) {
            setVersusDifficulty(state.difficulty as DifficultyKey);
          }
          setVsState(state);
          resetReplay();
          setVsMatch((m) =>
            m
              ? {
                  ...m,
                  status: state.status as MatchSession["status"],
                  board: { width: state.width, height: state.height, mines: state.mines, seed: state.seed, safeStart: state.safe_start ?? null },
                  hostId: state.host_id ?? m.hostId ?? null,
                }
              : m
          );
        })
        .catch(() => {
          localStorage.removeItem(VS_SESSION_KEY);
          setVsMatch(null);
          setVsState(null);
        });
    } catch {
      localStorage.removeItem(VS_SESSION_KEY);
    }
  }, []);

  useEffect(() => {
    const shouldTick = (board.startedAt && !board.endedAt) || (mode === "versus" && !isSpectator && vsState?.status === "active");
    if (!shouldTick) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [mode, board.startedAt, board.endedAt, vsState?.status, isSpectator]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (typeof window !== "undefined") {
      localStorage.setItem(UI_THEME_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(UI_VIEW_KEY, view);
      localStorage.setItem(UI_MODE_KEY, mode);
    }
  }, [view, mode]);

  useEffect(() => {
    if (mode === "solo") {
      setDifficulty(soloDifficulty);
      startFresh();
      return;
    }
    if (mode === "versus") {
      if (vsMatch) {
        applyBoardConfig({
          width: vsMatch.board.width,
          height: vsMatch.board.height,
          mines: vsMatch.board.mines,
          seed: vsMatch.board.seed,
          difficulty: vsMatch.board.difficulty as DifficultyKey | null,
          safe_start: vsMatch.board.safeStart ?? null
        });
      } else {
        setDifficulty(versusDifficulty);
        startFresh();
      }
    }
  }, [mode, soloDifficulty, versusDifficulty, vsMatch?.matchId]);

  useEffect(() => {
    setAutoSubmitted(false);
  }, [board.startedAt]);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setLoadingProfile(true);
        setProfileError(null);
        const data = await fetchProfile(token);
        if (!cancelled) setProfile(data);
      } catch (e) {
        if (!cancelled) setProfileError(e instanceof Error ? e.message : "讀取個人資料失敗");
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  useEffect(() => {
    setAuthError(null);
    setAuthPassword("");
    setAuthPasswordConfirm("");
  }, [authMode]);

  useEffect(() => {
    const saved = localStorage.getItem("auth_token");
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      return;
    }
    let cancelled = false;
    fetchMe(token)
      .then((user) => {
        if (cancelled) return;
        setCurrentUser(user);
        setAuthHandle(user.handle);
        setVsName((prev) => prev || user.handle);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentUser(null);
        setToken(null);
        localStorage.removeItem("auth_token");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const elapsedMs = useMemo(() => {
    if (!boardForView.startedAt) return 0;
    const end = boardForView.endedAt ?? now;
    return Math.max(0, end - boardForView.startedAt);
  }, [boardForView.endedAt, boardForView.startedAt, now]);

  const statusText = useMemo(() => {
    if (boardForView.status === "idle") return "未開始";
    if (boardForView.status === "won") return "你贏了！";
    if (boardForView.status === "lost") return mode === "versus" ? "你輸了" : "踩到雷 QQ";
    return "進行中";
  }, [boardForView.status, mode]);

  const replayDelayMs = useMemo(() => {
    switch (replaySpeed) {
      case "slow":
        return 900;
      case "fast":
        return 350;
      default:
        return 600;
    }
  }, [replaySpeed]);

  const myPlayer = useMemo(() => {
    if (!vsMatch || !vsState) return null;
    return vsState.players.find((p) => p.id === vsMatch.playerId) ?? null;
  }, [vsMatch, vsState]);

  const isHost = useMemo(() => {
    const hostId = vsState?.host_id ?? vsMatch?.hostId ?? null;
    return !!hostId && myPlayer?.id === hostId;
  }, [myPlayer?.id, vsMatch?.hostId, vsState?.host_id]);

  const opponent = useMemo(() => {
    if (!vsState || !vsMatch) return null;
    return vsState.players.find((p) => p.id !== vsMatch.playerId) ?? null;
  }, [vsState, vsMatch]);

  const spectatedPlayer = useMemo(() => {
    if (!vsState) return null;
    return vsState.players.find((p) => p.id === spectatorViewPlayerId) ?? null;
  }, [spectatorViewPlayerId, vsState]);

  const preStartLeft = useMemo(() => {
    const startMs = parseUtcMillis(vsState?.started_at);
    if (startMs === null) return null;
    return Math.max(0, Math.floor((startMs - now) / 1000));
  }, [vsState?.started_at, now]);

  const matchStarted = useMemo(() => {
    const startMs = parseUtcMillis(vsState?.started_at);
    if (startMs === null) return false;
    return now >= startMs;
  }, [vsState?.started_at, now]);

  const matchCountdownLeft = useMemo(() => {
    const startMs = parseUtcMillis(vsState?.started_at);
    if (startMs === null) return null;
    const secs = vsState?.countdown_secs ?? 0;
    const endMs = startMs + secs * 1000;
    const anchor = Math.max(now, startMs); // do not count down before start
    return Math.max(0, Math.floor((endMs - anchor) / 1000));
  }, [vsState?.started_at, vsState?.countdown_secs, now]);

  useEffect(() => {
    if (mode !== "versus") return;
    if (!vsState || vsState.status !== "active") return;
    if (preStartLeft && preStartLeft > 0) return;
    useGameStore.setState((state) => {
      const startedAt = state.board.startedAt ?? Date.now();
      const status = state.board.status === "idle" ? "playing" : state.board.status;
      return { board: { ...state.board, startedAt, status } };
    });
  }, [mode, vsState, preStartLeft]);

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

  const refreshProfile = async () => {
    if (!isAuthenticated || !token) return;
    try {
      setLoadingProfile(true);
      setProfileError(null);
      const data = await fetchProfile(token);
      setProfile(data);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "讀取個人資料失敗");
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    loadLeaderboard(board.difficulty);
  }, [board.difficulty]);

  useEffect(() => {
    if (view !== "profile") return;
    refreshProfile();
  }, [view]);

  // Persist versus session so browser refresh can resume.
  useEffect(() => {
    if (vsMatch && !isSpectator) {
      localStorage.setItem(
        VS_SESSION_KEY,
        JSON.stringify({ matchId: vsMatch.matchId, playerId: vsMatch.playerId, playerToken: vsMatch.playerToken })
      );
    } else {
      localStorage.removeItem(VS_SESSION_KEY);
    }
  }, [vsMatch, isSpectator]);

  useEffect(() => {
    if (mode !== "versus" || !vsMatch) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const state = await fetchMatchState(vsMatch.matchId);
        if (cancelled) return;
        setVsError(null);
        const prevStatus = vsPrevStatusRef.current;
        vsPrevStatusRef.current = state.status;
        setVsState(state);
        setVsMatch((m) =>
          m
            ? {
                ...m,
                status: state.status,
                board: {
                  width: state.width,
                  height: state.height,
                  mines: state.mines,
                  seed: state.seed,
                  safeStart: state.safe_start ?? m.board.safeStart ?? null
                },
                hostId: state.host_id ?? m.hostId ?? null
              }
            : m
        );
        if (state.status === "finished" && prevStatus !== "finished") {
          setIsSpectator(true);
          resetReplay();
        }
      } catch (err) {
        if (!cancelled) {
          setVsError(err instanceof Error ? err.message : "對局狀態讀取失敗");
          if (isSpectator) {
            setVsInfo("對局已不存在，已退出觀戰");
            setVsMatch(null);
            setVsState(null);
            setIsSpectator(false);
            setSpectateId("");
            setSelectedResultPlayerId(null);
          }
        }
      }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode, vsMatch?.matchId]);

  useEffect(() => {
    vsStateRef.current = vsState;
  }, [vsState]);

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
      setSelectedResultPlayerId(null);
      resetReplay();
      return;
    }
    if (selectedResultPlayerId === null && vsState.players.length > 0) {
      setSelectedResultPlayerId(vsState.players[0].id);
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

  useEffect(() => {
    if (vsState?.status !== "finished") return;
    refreshProfile();
    fetchRecentMatches()
      .then((data) => {
        setRecentMatches(data);
        setRecentError(null);
      })
      .catch((e) => setRecentError(e instanceof Error ? e.message : "讀取最近對戰失敗"));
  }, [vsState?.status]);

  useEffect(() => {
    if (mode !== "versus") return;
    if (!vsState || vsState.status !== "finished") return;
    if (!myPlayer) return;
    useGameStore.setState((state) => {
      const board = state.board;
      if (board.status === "won" || board.status === "lost") return state;

      const status = myPlayer.result === "win" ? "won" : myPlayer.result === "lose" ? "lost" : board.status;
      if (status === board.status) return state;
      return { board: { ...board, status, endedAt: board.endedAt ?? Date.now() } };
    });
  }, [mode, vsState?.status, myPlayer]);

  const handleSoloDifficulty = (key: DifficultyKey) => {
    setSoloDifficulty(key);
    if (mode === "solo") {
      setDifficulty(key);
      startFresh();
    }
  };

  const handleVersusDifficulty = (key: DifficultyKey) => {
    if (vsMatch && vsState?.status !== "finished") {
      setVsError("對戰進行中，無法切換難度");
      return;
    }
    setVersusDifficulty(key);
    if (mode === "versus" && !vsMatch) {
      setDifficulty(key);
      startFresh();
    }
  };

  const handleSubmit = async () => {
    if (board.status !== "won" || !board.endedAt || !board.startedAt) return;
    if (!isAuthenticated || !token || !currentUser) {
      setError("請先登入後再送出");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await submitScore({ difficulty: board.difficulty, timeMs: elapsedMs, token });
      await loadLeaderboard(board.difficulty);
      await refreshProfile();
      setAutoSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失敗");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !token || !currentUser) return;
    if (board.status !== "won" || !board.startedAt || !board.endedAt) return;
    if (autoSubmitted || submitting) return;
    let cancelled = false;
    const run = async () => {
      setAutoSubmitted(true);
      try {
        setSubmitting(true);
        setError(null);
        await submitScore({ difficulty: board.difficulty, timeMs: elapsedMs, token });
        await loadLeaderboard(board.difficulty);
        await refreshProfile();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "提交失敗");
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [autoSubmitted, board.difficulty, board.endedAt, board.startedAt, board.status, elapsedMs, isAuthenticated, token, currentUser, submitting]);

  useEffect(() => {
    if (selectedResultPlayerId === null) return;
    resetReplay();
  }, [selectedResultPlayerId, vsMatch?.matchId]);

  useEffect(() => {
    if (vsState?.status === "finished" && !isSpectator) {
      setIsSpectator(true);
    }
  }, [vsState?.status, isSpectator]);

  useEffect(() => {
    if (!isSpectator || !vsState) {
      setSpectatorViewPlayerId(null);
      setSpectatorBoard(null);
      setSpectatorBoardError(null);
      setSpectatorBoardLoading(false);
      return;
    }
    if (spectatorViewPlayerId === null && vsState.players.length > 0) {
      setSpectatorViewPlayerId(vsState.players[0].id);
    }
  }, [isSpectator, spectatorViewPlayerId, vsState]);

  useEffect(() => {
    if (!replayPlaying) return;
    if (!replayBoard) return;
    if (replayIndex >= replaySteps.length) {
      setReplayPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      const step = replaySteps[replayIndex];
      setReplayBoard((prev) => (prev ? applyReplayStep(prev, step) : prev));
      setReplayIndex((i) => i + 1);
    }, replayDelayMs);
    return () => clearTimeout(timer);
  }, [replayDelayMs, replayIndex, replayPlaying, replayBoard, replaySteps]);

  const applyBoardConfig = (config: {
    width: number;
    height: number;
    mines: number;
    seed: string;
    difficulty?: DifficultyKey | null;
    safe_start?: { x: number; y: number } | null;
    safeStart?: { x: number; y: number } | null;
  }) => {
    const diff = config.difficulty ?? board.difficulty;
    const safeStart = config.safe_start ?? config.safeStart ?? board.safeStart ?? null;
    setDifficulty(diff, { width: config.width, height: config.height, mines: config.mines, seed: config.seed, safeStart });
  };

  const getProgressBoard = (progress?: MatchProgress | null): BoardState | null => {
    const boardSnapshot = progress?.board as BoardState | undefined;
    if (!boardSnapshot || !Array.isArray(boardSnapshot.cells)) return null;
    return boardSnapshot;
  };

  const renderResult = (result?: string | null, matchStatus?: string) => {
    if (!result) return matchStatus === "finished" ? "已結束" : "進行中";
    switch (result) {
      case "win":
        return "勝利";
      case "lose":
        return "失敗";
      case "draw":
        return "平手";
      case "forfeit":
        return "棄權";
      default:
        return result;
    }
  };

  const handleCreateMatch = async () => {
    if (vsMatch && vsState?.status !== "finished") {
      setVsError("已在對局中，請先退出或等待結束");
      return;
    }
    clearSpectateView();
    if (!isAuthenticated || !currentUser) {
      setVsError("請先登入");
      return;
    }
    const displayName = currentUser.handle;
    if (!displayName) {
      setVsError("請先登入");
      return;
    }
    try {
      setVsError(null);
      setVsInfo("建立中...");
      const cfg = { width: board.width, height: board.height, mines: board.mines, seed: board.seed };
      const session = await createMatch({
        width: cfg.width,
        height: cfg.height,
        mines: cfg.mines,
        seed: cfg.seed,
        difficulty: board.difficulty,
        token: token as string
      });
      setVsMatch({ ...session, status: "pending" });
      setVsName(displayName);
      setVsState(null);
      setSpectateId("");
      setVsStepCount(0);
      setVsProgressUploaded(false);
      setSelectedResultPlayerId(null);
      resetReplay();
      applyBoardConfig(session.board);
      setVsInfo(`已建立對局，分享 ID: ${session.matchId}`);
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "建立失敗");
    }
  };

  const handleJoinMatch = async () => {
    if (vsMatch && !isSpectator && vsState?.status !== "finished") {
      setVsError("已在對局中，請先退出或等待結束");
      return;
    }
    clearSpectateView();
    const idNum = Number(joinId);
    if (!joinId || Number.isNaN(idNum)) {
      setVsError("請輸入有效的對局 ID");
      return;
    }
    if (!isAuthenticated || !currentUser) {
      setVsError("請先登入");
      return;
    }
    const displayName = currentUser.handle;
    if (!displayName) {
      setVsError("請先登入");
      return;
    }
    try {
      setVsError(null);
      setVsInfo("加入中...");
      const session = await joinMatch(idNum, { token: token as string });
      setVsMatch(session);
      setVsName(displayName);
      setVsState(null);
      setSpectateId("");
      setVsStepCount(0);
      setVsProgressUploaded(false);
      setSelectedResultPlayerId(null);
      resetReplay();
      applyBoardConfig(session.board);
      setVsInfo(`已加入對局 #${session.matchId}`);
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "加入失敗");
    }
  };

  const handleLeaveMatch = async () => {
    if (!vsMatch) return;
    if (!isSpectator && matchStarted && vsState?.status === "active") {
      setVsError("對局已開始，無法退出");
      return;
    }
    setVsError(null);
    try {
      const notStarted = !matchStarted;
      if (!isSpectator && notStarted) {
        const soloMatch = (vsState?.players?.length ?? 0) <= 1;
        if (soloMatch) {
          await deleteMatch(vsMatch.matchId, { playerToken: vsMatch.playerToken });
          setVsInfo("已退出並刪除對局");
        } else {
          await leaveMatch(vsMatch.matchId, { playerToken: vsMatch.playerToken });
          setVsInfo("已退出對局");
        }
      } else {
        setVsInfo("已退出對局");
      }
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "退出失敗");
      return;
    }

    setVsMatch(null);
    setVsState(null);
    setIsSpectator(false);
    setSpectateId("");
    setVsStepCount(0);
    setVsProgressUploaded(false);
    setSelectedResultPlayerId(null);
    setSpectatorViewPlayerId(null);
    setSpectatorBoard(null);
    setSpectatorBoardError(null);
    setSpectatorBoardLoading(false);
    resetReplay();
    startFresh();
    localStorage.removeItem(VS_SESSION_KEY);
  };

  const handleSpectate = async () => {
    const idNum = Number(spectateId);
    if (!spectateId || Number.isNaN(idNum)) {
      setVsError("請輸入有效的觀戰 ID");
      return;
    }
    if (vsMatch && !isSpectator && vsState?.status !== "finished") {
      setVsError("目前在對局中，請先退出或等待結束");
      return;
    }
    try {
      setVsError(null);
      setVsInfo("載入對局中...");
      const state = await fetchMatchState(idNum);
      const session: MatchSession = {
        matchId: idNum,
        playerId: -1,
        playerToken: "",
        board: { width: state.width, height: state.height, mines: state.mines, seed: state.seed, safeStart: state.safe_start ?? null },
        status: state.status,
        hostId: state.host_id ?? null
      };
      setVsMatch(session);
      setVsState(state);
      setIsSpectator(true);
      setVsStepCount(0);
      setVsProgressUploaded(false);
      setSelectedResultPlayerId(state.players[0]?.id ?? null);
      setSpectatorViewPlayerId(state.players[0]?.id ?? null);
      setSpectatorBoard(null);
      setSpectatorBoardError(null);
      setSpectatorBoardLoading(false);
      resetReplay();
      setVsInfo(`觀戰對局 #${idNum}`);
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "觀戰載入失敗");
    }
  };

  const handleSetReady = async () => {
    if (isSpectator) {
      setVsError("觀戰模式無法準備");
      return;
    }
    if (!vsMatch) {
      setVsError("尚未加入對局");
      return;
    }
    if (isHost) {
      setVsError("房主無需準備，可直接開始");
      return;
    }
    const nextReady = !myPlayer?.ready;
    try {
      setVsError(null);
      setVsInfo(nextReady ? "等待對手準備..." : "已取消準備");
      await setReady(vsMatch.matchId, { playerToken: vsMatch.playerToken, ready: nextReady });
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "設定準備失敗");
    }
  };

  const handleStartMatch = async () => {
    if (isSpectator) {
      setVsError("觀戰模式無法開始");
      return;
    }
    if (!vsMatch || !vsState) {
      setVsError("尚未加入對局");
      return;
    }
    const hostId = vsState.host_id ?? vsMatch.hostId ?? null;
    if (!myPlayer || hostId !== myPlayer.id) {
      setVsError("只有房主可以開始");
      return;
    }
    if (vsState.status !== "pending") {
      setVsError("對局已開始或已結束");
      return;
    }
    if ((vsState.players?.length ?? 0) < 2) {
      setVsError("至少需要 2 名玩家才能開始");
      return;
    }
    const others = (vsState.players ?? []).filter((p) => p.id !== myPlayer.id);
    if (!others.every((p) => p.ready)) {
      setVsError("需等其他玩家都準備");
      return;
    }
    try {
      setVsError(null);
      setVsInfo("即將開始，請準備...");
      const res = await startMatch(vsMatch.matchId, { playerToken: vsMatch.playerToken });
      setVsState((prev) =>
        prev
          ? {
              ...prev,
              status: res.status ?? prev.status,
              started_at: res.started_at ?? prev.started_at,
              countdown_secs: res.countdown_secs ?? prev.countdown_secs
            }
          : prev
      );
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "開始對局失敗");
    }
  };

  const sendStepIfNeeded = async (action: "reveal" | "flag" | "chord", x: number, y: number, nextStepCount: number) => {
    if (mode !== "versus" || !vsMatch) return;
    if (isSpectator) {
      setVsError("觀戰模式僅供查看");
      return;
    }
    if (!vsState || vsState.status !== "active") {
      setVsError("雙方尚未準備，無法操作");
      return;
    }
    if (preStartLeft !== null && preStartLeft > 0) {
      setVsError("對局即將開始，請稍候");
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
        await refreshProfile();
        try {
          const recent = await fetchRecentMatches();
          setRecentMatches(recent);
          setRecentError(null);
        } catch (e) {
          setRecentError(e instanceof Error ? e.message : "讀取最近對戰失敗");
        }
        setVsMatch({ ...vsMatch, status: "finished" });
        setIsSpectator(true);
        resetReplay();
        setVsInfo(current.status === "won" ? "你完成了！" : "你踩雷了");
      } catch (e) {
        setVsError(e instanceof Error ? e.message : "結束對局失敗");
      }
    }
  };

  const buildReplayBoard = () => {
    if (!vsState) return null;
    const baseDifficulty = (vsState.difficulty as DifficultyKey | null) ?? versusDifficulty;
    return createEmptyState(baseDifficulty, {
      width: vsState.width,
      height: vsState.height,
      mines: vsState.mines,
      seed: vsState.seed,
      safeStart: vsState.safe_start ?? null
    });
  };

  const loadSpectatorBoard = useCallback(
    async (targetPlayerId?: number) => {
      if (!isSpectator || !vsMatch) return;
      const currentState = vsStateRef.current;
      if (!currentState) return;

      const fallbackId = currentState.players[0]?.id;
      const playerId = targetPlayerId ?? spectatorViewPlayerId ?? fallbackId;
      if (playerId === undefined || playerId === null) return;
      const player = currentState.players.find((p) => p.id === playerId);
      if (!player) return;
      const baseDifficulty = (currentState.difficulty as DifficultyKey | null) ?? versusDifficulty;
      const baseBoard = createEmptyState(baseDifficulty, {
        width: currentState.width,
        height: currentState.height,
        mines: currentState.mines,
        seed: currentState.seed,
        safeStart: currentState.safe_start ?? null
      });

      setSpectatorBoardLoading(true);
      setSpectatorBoardError(null);
      try {
        if (player.progress?.board) {
          setSpectatorBoard(player.progress.board as BoardState);
        } else {
          const steps = await fetchMatchSteps(vsMatch.matchId);
          const filtered = steps.filter((s) => s.player_name === player.name);
          const reconstructed = filtered.reduce((state, step) => applyReplayStep(state, step), baseBoard);
          setSpectatorBoard(reconstructed);
        }
      } catch (e) {
        setSpectatorBoardError(e instanceof Error ? e.message : "載入觀戰棋盤失敗");
        setSpectatorBoard(null);
      } finally {
        setSpectatorBoardLoading(false);
      }
    },
    [isSpectator, spectatorViewPlayerId, vsMatch?.matchId, versusDifficulty]
  );

  useEffect(() => {
    if (!isSpectator || spectatorViewPlayerId === null) return;
    loadSpectatorBoard(spectatorViewPlayerId);
  }, [isSpectator, loadSpectatorBoard, spectatorViewPlayerId, vsMatch?.matchId, vsState?.status]);

  const startReplayForSelected = async () => {
    if (!vsMatch || !vsState) return;
    const player = vsState.players.find((p) => p.id === selectedResultPlayerId) ?? vsState.players[0];
    if (!player) return;
    setReplayLoading(true);
    setReplayError(null);
    setReplayPlaying(false);
    setReplayIndex(0);
    const baseBoard = buildReplayBoard();
    if (!baseBoard) {
      setReplayLoading(false);
      setReplayError("無法建立回放棋盤");
      return;
    }
    try {
      const steps = await fetchMatchSteps(vsMatch.matchId);
      const ordered = steps
        .filter((s) => s.player_name === player.name)
        .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

      if (ordered.length === 0) {
        setReplayBoard(null);
        setReplaySteps([]);
        setReplayIndex(0);
        setReplayPlaying(false);
        setReplayError("沒有找到此玩家的步驟");
        return;
      }

      setReplayBoard(baseBoard);
      setReplaySteps(ordered);
      setReplayIndex(0);
      setReplayPlaying(true);
    } catch (e) {
      setReplayError(e instanceof Error ? e.message : "載入步驟失敗");
    } finally {
      setReplayLoading(false);
    }
  };

  const handleReveal = async (x: number, y: number) => {
    if (mode === "versus") {
      if (isSpectator) {
        setVsError("觀戰模式無法操作");
        return;
      }
      if (vsMatch?.status === "finished") return;
      if (!vsState || vsState.status !== "active") {
        setVsError("對局尚未開始");
        return;
      }
      if (preStartLeft !== null && preStartLeft > 0) {
        setVsError("對局即將開始，請稍候");
        return;
      }
      const safe = board.safeStart;
      const notStarted = !board.startedAt && board.status === "idle";
      if (safe && notStarted && (x !== safe.x || y !== safe.y)) {
        setVsError(`請先踩起始點 (${safe.x}, ${safe.y})`);
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
      if (isSpectator) {
        setVsError("觀戰模式無法操作");
        return;
      }
      if (vsMatch?.status === "finished") return;
      if (!vsState || vsState.status !== "active") {
        setVsError("對局尚未開始");
        return;
      }
      if (preStartLeft !== null && preStartLeft > 0) {
        setVsError("對局即將開始，請稍候");
        return;
      }
      const safe = board.safeStart;
      const notStarted = !board.startedAt && board.status === "idle";
      if (safe && notStarted) {
        setVsError(`請先踩起始點 (${safe.x}, ${safe.y})`);
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
      if (isSpectator) {
        setVsError("觀戰模式無法操作");
        return;
      }
      if (vsMatch?.status === "finished") return;
      if (!vsState || vsState.status !== "active") {
        setVsError("對局尚未開始");
        return;
      }
      if (preStartLeft !== null && preStartLeft > 0) {
        setVsError("對局即將開始，請稍候");
        return;
      }
      const safe = board.safeStart;
      const notStarted = !board.startedAt && board.status === "idle";
      if (safe && notStarted) {
        setVsError(`請先踩起始點 (${safe.x}, ${safe.y})`);
        return;
      }
    }
    chordCell(x, y);
    const nextCount = vsStepCount + 1;
    await sendStepIfNeeded("chord", x, y, nextCount);
    await finishIfNeeded();
  };

  const handleAuthSubmit = async () => {
    if (!authHandle.trim() || !authPassword.trim()) {
      setAuthError("請輸入帳號與密碼");
      return;
    }
    if (authMode === "register" && authPassword !== authPasswordConfirm) {
      setAuthError("兩次輸入的密碼不一致");
      return;
    }
    try {
      setAuthLoading(true);
      setAuthError(null);
      const nextToken =
        authMode === "login"
          ? await login({ handle: authHandle.trim(), password: authPassword })
          : await register({ handle: authHandle.trim(), password: authPassword });
      setToken(nextToken);
      localStorage.setItem("auth_token", nextToken);
      setAuthPassword("");
      setAuthPasswordConfirm("");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "請稍後再試");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem("auth_token");
  };

  const resetReplay = () => {
    setReplayBoard(null);
    setReplaySteps([]);
    setReplayIndex(0);
    setReplayPlaying(false);
    setReplayError(null);
  };

  const clearSpectateView = () => {
    setIsSpectator(false);
    setSpectatorViewPlayerId(null);
    setSpectatorBoard(null);
    setSpectatorBoardError(null);
    setSpectatorBoardLoading(false);
  };

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 text-[var(--text-primary)]">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">踩地雷</h1>
          <p className="text-sm opacity-80">
            {view === "solo" && "單人模式（首擊保護）"}
            {view === "versus" && "對戰模式（同圖同步／踩雷即敗）"}
            {view === "profile" && "個人主頁（最高分與對戰紀錄）"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => {
              setView("solo");
              setMode("solo");
            }}
            className={`px-3 py-2 rounded-full text-sm border ${
              view === "solo" ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface-strong)] border-[var(--border)]"
            }`}
          >
            單人
          </button>
          <button
            onClick={() => {
              setView("versus");
              setMode("versus");
            }}
            className={`px-3 py-2 rounded-full text-sm border ${
              view === "versus" ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface-strong)] border-[var(--border)]"
            }`}
          >
            對戰
          </button>
          <button
            onClick={() => setView("profile")}
            className={`px-3 py-2 rounded-full text-sm border ${
              view === "profile" ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface-strong)] border-[var(--border)]"
            }`}
          >
            個人主頁
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

      {view === "profile" ? (
        <section className="space-y-4">
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">個人主頁</h2>
              <div className="text-sm opacity-80">{currentUser ? currentUser.handle : "請登入"}</div>
            </div>
            {!isAuthenticated ? (
              <p className="text-sm text-red-600">請先登入查看個人資料</p>
            ) : loadingProfile ? (
              <p className="text-sm opacity-70">載入中...</p>
            ) : profileError ? (
              <p className="text-sm text-red-600">{profileError}</p>
            ) : profile ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">各難度最佳成績</h3>
                  {profile.best_scores.length === 0 ? (
                    <p className="text-sm opacity-70">尚無成績</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {profile.best_scores.map((b) => (
                        <li key={`${b.difficulty}-${b.time_ms}`} className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                          <span className="font-medium">{b.difficulty}</span>
                          <span className="font-mono">{formatMs(b.time_ms)} s</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold mb-2">對戰紀錄（最近 30 筆）</h3>
                  {profile.match_history.length === 0 ? (
                    <p className="text-sm opacity-70">尚無對戰紀錄</p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {profile.match_history.map((m) => (
                        <div key={m.match_id} className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">#{m.match_id}</span>
                            <span className="opacity-70">{m.status}</span>
                          </div>
                          <div className="text-xs opacity-80">
                            {m.width}x{m.height} / {m.mines} 雷 · {m.difficulty ?? "-"}
                          </div>
                          <div className="flex items-center justify-between text-xs opacity-80 mt-1">
                            <span>結果：{renderResult(m.result, m.status)}</span>
                            <span>{m.duration_ms ? `${formatMs(m.duration_ms)} s` : "--"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <section className="grid md:grid-cols-[auto,320px] gap-8 items-start justify-center">
            <div className="space-y-3 flex flex-col items-center">
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 rounded-lg bg-[var(--surface)] shadow border border-[var(--border)]">
                  <div className="text-xs opacity-70">計時</div>
                  <div className="text-2xl font-mono">{formatMs(elapsedMs)} s</div>
                </div>
                <div className="px-4 py-2 rounded-lg bg-[var(--surface)] shadow border border-[var(--border)]">
                  <div className="text-xs opacity-70">剩餘雷</div>
                  <div className="text-2xl font-mono">{remainingMines(boardForView)}</div>
                </div>
                <div className="px-4 py-2 rounded-lg bg-[var(--surface)] shadow border border-[var(--border)]">
                  <div className="text-xs opacity-70">狀態</div>
                  <div className="text-lg font-semibold">{statusText}</div>
                </div>
              </div>

              <div className="w-max relative">
                {mode === "versus" && vsState?.status === "active" && preStartLeft !== null && preStartLeft > 0 && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-white text-2xl font-semibold rounded-xl">
                    對局將在 {preStartLeft} 秒後開始
                  </div>
                )}
                {mode === "versus" && isSpectator && (vsState?.players?.length ?? 0) > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="opacity-80">觀戰顯示：</span>
                    {vsState?.players.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSpectatorViewPlayerId(p.id)}
                        className={`px-3 py-1 rounded-full border text-xs ${
                          spectatorViewPlayerId === p.id
                            ? "bg-[var(--accent)] text-white border-transparent"
                            : "bg-[var(--surface-strong)] border-[var(--border)]"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                    <button
                      onClick={() => loadSpectatorBoard(spectatorViewPlayerId ?? undefined)}
                      disabled={spectatorBoardLoading}
                      className="px-3 py-1 rounded-full border text-xs bg-[var(--surface-strong)] border-[var(--border)] disabled:opacity-60"
                    >
                      {spectatorBoardLoading ? "載入中..." : "更新棋盤"}
                    </button>
                    {spectatorBoardError && <span className="text-xs text-red-600">{spectatorBoardError}</span>}
                    {spectatedPlayer && !spectatorBoardError && !spectatorBoardLoading && (
                      <span className="text-xs opacity-70">正在查看：{spectatedPlayer.name}</span>
                    )}
                  </div>
                )}
                <Board board={boardForView} onReveal={handleReveal} onFlag={handleFlag} onChord={handleChord} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">帳號</h2>
                  {!isAuthenticated && (
                    <div className="flex gap-2 text-sm">
                      <button
                        onClick={() => setAuthMode("login")}
                        className={`px-3 py-1 rounded-full border ${
                          authMode === "login" ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface-strong)] border-[var(--border)]"
                        }`}
                      >
                        登入
                      </button>
                      <button
                        onClick={() => setAuthMode("register")}
                        className={`px-3 py-1 rounded-full border ${
                          authMode === "register" ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface-strong)] border-[var(--border)]"
                        }`}
                      >
                        註冊
                      </button>
                    </div>
                  )}
                </div>
                {isAuthenticated && currentUser ? (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                    <div>
                      <div className="text-xs opacity-70">已登入</div>
                      <div className="font-semibold">{currentUser.handle}</div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="text-sm px-3 py-1 rounded border border-[var(--border)] bg-[var(--surface)]"
                    >
                      登出
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={authHandle}
                      onChange={(e) => setAuthHandle(e.target.value)}
                      placeholder="帳號（英數 3-50）"
                      className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
                    />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="密碼（至少 6 碼）"
                      className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
                    />
                    {authMode === "register" && (
                      <input
                        type="password"
                        value={authPasswordConfirm}
                        onChange={(e) => setAuthPasswordConfirm(e.target.value)}
                        placeholder="再次輸入密碼"
                        className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
                      />
                    )}
                    <button
                      onClick={handleAuthSubmit}
                      disabled={authLoading}
                      className="w-full rounded bg-[var(--accent-strong)] text-white py-2 disabled:opacity-60"
                    >
                      {authLoading ? "處理中..." : authMode === "login" ? "登入" : "註冊並登入"}
                    </button>
                    <p className="text-xs opacity-70">登入後排行榜與對戰名稱會使用帳號 Handle</p>
                    {authError && <p className="text-sm text-red-600">{authError}</p>}
                  </div>
                )}
              </div>

              {mode === "solo" ? (
                <>
                  <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-semibold">單人難度</h2>
                        <span className="text-xs opacity-70">獨立於對戰</span>
                      </div>
                      <button
                        onClick={() => startFresh()}
                        className="px-3 py-2 rounded-full text-sm border bg-[var(--accent-strong)] text-white border-transparent"
                      >
                        重新開始
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {difficultiesList.map((d) => (
                        <button
                          key={d.key}
                          onClick={() => handleSoloDifficulty(d.key)}
                          className={`px-3 py-2 rounded-full text-sm border ${
                            soloDifficulty === d.key
                              ? "bg-[var(--accent)] text-white border-transparent"
                              : "bg-[var(--surface-strong)] border-[var(--border)]"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">送出成績</h2>
                      <span className="text-xs opacity-70">勝利後自動上榜（需登入）</span>
                    </div>
                    <div className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 flex items-center justify-between">
                      <div className="text-sm">
                        {isAuthenticated && currentUser ? (
                          <>
                            <span className="opacity-70 mr-1">玩家</span>
                            <span className="font-semibold">{currentUser.handle}</span>
                          </>
                        ) : (
                          <span className="opacity-70">請先登入以自動上榜</span>
                        )}
                      </div>
                      <span className="text-xs opacity-70">{board.difficulty}</span>
                    </div>
                    <p className="text-sm opacity-80">完成一局後自動送出最佳成績，不需手動點擊。</p>
                    {submitting && <p className="text-sm text-green-600">送出中...</p>}
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
                    <div className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="opacity-70">對戰難度（僅影響新對局）</span>
                        <span className="text-xs opacity-70">獨立於單人</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {difficultiesList.map((d) => (
                          <button
                            key={d.key}
                            onClick={() => handleVersusDifficulty(d.key)}
                            disabled={!!vsMatch && vsState?.status !== "finished"}
                            className={`px-3 py-1.5 rounded-full text-xs border ${
                              versusDifficulty === d.key
                                ? "bg-[var(--accent)] text-white border-transparent"
                                : "bg-[var(--surface)] border-[var(--border)]"
                            } disabled:opacity-60`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 flex items-center justify-between text-sm">
                      <span className="opacity-70">對戰名稱</span>
                      <span className="font-semibold">{currentUser ? currentUser.handle : "請先登入"}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleCreateMatch}
                        disabled={!isAuthenticated || !currentUser || (!!vsMatch && vsState?.status !== "finished")}
                        className="w-full rounded bg-[var(--accent-strong)] text-white py-2 disabled:opacity-60"
                      >
                        建立對局
                      </button>
                      <button
                        onClick={handleJoinMatch}
                        disabled={!isAuthenticated || !currentUser || (!!vsMatch && vsState?.status !== "finished")}
                        className="w-full rounded bg-[var(--surface-strong)] border border-[var(--border)] py-2 disabled:opacity-60"
                      >
                        加入對局
                      </button>
                    </div>
                    <button
                      onClick={handleLeaveMatch}
                      disabled={!vsMatch || (!isSpectator && vsState?.status === "active" && matchStarted)}
                      className="w-full rounded bg-[var(--surface-strong)] border border-[var(--border)] py-2 disabled:opacity-60"
                    >
                      退出對局（開始前）
                    </button>
                    <input
                      value={joinId}
                      onChange={(e) => setJoinId(e.target.value)}
                      placeholder="輸入對局 ID"
                      className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
                      disabled={!isAuthenticated || !currentUser}
                    />
                    <input
                      value={spectateId}
                      onChange={(e) => setSpectateId(e.target.value)}
                      placeholder="輸入觀戰 ID"
                      className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
                    />
                    <button
                      onClick={handleSpectate}
                      disabled={!!vsMatch && !isSpectator && vsState?.status !== "finished"}
                      className="w-full rounded bg-[var(--surface-strong)] border border-[var(--border)] py-2 disabled:opacity-60"
                    >
                      觀戰對局
                    </button>
                    {!isAuthenticated && <p className="text-sm text-red-600">請登入後才能建立或加入對局</p>}
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
                        <p>狀態：{isSpectator ? "觀戰中" : vsState?.status ?? vsMatch.status}</p>
                        <p>
                          棋盤：{vsMatch.board.width}x{vsMatch.board.height}，雷 {vsMatch.board.mines}
                        </p>
                        <p>
                          倒數：
                          {vsState?.started_at
                            ? preStartLeft && preStartLeft > 0
                              ? `準備中 ${preStartLeft}s`
                              : formatCountdown(matchCountdownLeft)
                            : "等待開始"}
                        </p>
                        <div className="space-y-1">
                          {(vsState?.players ?? []).map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-sm">
                              <span>
                                {p.name}
                                {vsState?.host_id === p.id ? " (房主)" : ""}
                              </span>
                              <span className="opacity-70 flex items-center gap-2">
                                <span>
                                  {vsState?.host_id === p.id ? "-" : p.ready ? "已準備" : "未準備"}
                                </span>
                                <span>{renderResult(p.result, vsState?.status)}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={handleSetReady}
                          disabled={isHost || vsState?.status === "active" || vsState?.status === "finished"}
                          className="w-full rounded bg-[var(--accent-strong)] text-white py-2 disabled:opacity-60"
                        >
                          {isHost ? "房主無需準備" : myPlayer?.ready ? "取消準備" : "我已準備"}
                        </button>
                        {isHost && vsState?.status === "pending" && (
                          <button
                            onClick={handleStartMatch}
                            disabled={(() => {
                              const countOk = (vsState?.players?.length ?? 0) >= 2;
                              if (!countOk) return true;
                              const others = (vsState?.players ?? []).filter((p) => p.id !== myPlayer?.id);
                              return !others.every((p) => p.ready);
                            })()}
                            className="w-full rounded bg-[var(--surface-strong)] border border-[var(--border)] py-2 disabled:opacity-60"
                          >
                            {(() => {
                              const playerCount = vsState?.players?.length ?? 0;
                              if (playerCount < 2) return "等待至少 2 名玩家";
                              const others = (vsState?.players ?? []).filter((p) => p.id !== myPlayer?.id);
                              if (!others.every((p) => p.ready)) return "等待其他玩家準備";
                              return "開始對局 (房主)";
                            })()}
                          </button>
                        )}
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
                            {m.status !== "finished" && m.players.length > 0 && m.players[0]?.ready && m.players[1]?.ready && (
                              <div className="text-xs text-yellow-500">已同步起始點，雙方請踩指定開局格</div>
                            )}
                            <div className="flex flex-wrap gap-2 mt-1">
                              {m.players.map((p, idx) => (
                                <span
                                  key={`${m.match_id}-${idx}-${p.name}`}
                                  className="px-2 py-1 rounded-full text-xs border border-[var(--border)] bg-[var(--surface)]"
                                >
                                  {p.name}：{p.ready ? "已準備" : "未準備"}／{renderResult(p.result, m.status)}
                                </span>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                </>
              )}
            </div>
          </section>

          {mode === "versus" && vsMatch && vsState?.status === "finished" && (
            <section className="space-y-4">
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold">對戰棋盤回顧</h2>
                  <div className="text-sm opacity-70 flex items-center gap-2">
                    <span>選擇玩家並播放步驟</span>
                    {replaySteps.length > 0 && (
                      <span className="text-xs">步驟 {Math.min(replayIndex, replaySteps.length)} / {replaySteps.length}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {vsState.players.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedResultPlayerId(p.id)}
                      className={`px-3 py-1 rounded-full text-sm border ${
                        selectedResultPlayerId === p.id
                          ? "bg-[var(--accent)] text-white border-transparent"
                          : "bg-[var(--surface-strong)] border-[var(--border)]"
                      }`}
                    >
                      {p.name} ({renderResult(p.result, vsState.status)})
                    </button>
                  ))}
                </div>

                {(() => {
                  const p = vsState.players.find((pl) => pl.id === selectedResultPlayerId) ?? vsState.players[0];
                  const snap = p ? getProgressBoard(p.progress ?? null) : null;
                  if (!p) return <p className="text-sm opacity-70">沒有棋盤紀錄</p>;

                  const boardToShow = replayBoard ?? snap;

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-sm opacity-80">{p.result ?? "完成"}</div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <button
                            onClick={startReplayForSelected}
                            disabled={replayLoading || !snap}
                            className="px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-strong)] disabled:opacity-60"
                          >
                            {replayLoading ? "載入中..." : "播放此玩家步驟"}
                          </button>
                          <button
                            onClick={() => setReplayPlaying((pState) => !pState)}
                            disabled={replaySteps.length === 0}
                            className="px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-strong)] disabled:opacity-60"
                          >
                            {replayPlaying ? "暫停" : "繼續"}
                          </button>
                          <button
                            onClick={() => {
                              const base = buildReplayBoard();
                              if (!base) {
                                setReplayError("無法重建回放棋盤");
                                setReplayPlaying(false);
                                return;
                              }
                              setReplayIndex(0);
                              setReplayBoard(base);
                              setReplayPlaying(false);
                              setReplayError(null);
                            }}
                            disabled={replaySteps.length === 0}
                            className="px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-strong)] disabled:opacity-60"
                          >
                            重設
                          </button>
                          <label className="flex items-center gap-1 text-xs opacity-80">
                            <span>速度</span>
                            <select
                              value={replaySpeed}
                              onChange={(e) => setReplaySpeed(e.target.value as typeof replaySpeed)}
                              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                            >
                              <option value="slow">慢</option>
                              <option value="normal">正常</option>
                              <option value="fast">快</option>
                            </select>
                          </label>
                        </div>
                      </div>
                      {replayError && <p className="text-sm text-red-600">{replayError}</p>}
                      {boardToShow ? (
                        <div className="max-w-full overflow-auto">
                          <Board board={boardToShow} onReveal={() => {}} onFlag={() => {}} onChord={() => {}} maxWidth={900} />
                        </div>
                      ) : (
                        <p className="text-sm opacity-70">沒有棋盤紀錄</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default App;
