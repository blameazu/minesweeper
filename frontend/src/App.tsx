import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./components/Board";
import { useGameStore } from "./state/gameStore";
import { difficultiesList, remainingMines, createEmptyState, reveal as replayReveal, toggleFlag as replayToggleFlag, chordReveal as replayChordReveal } from "./lib/engine";
import MarkdownIt from "markdown-it";
import markdownItKatex from "markdown-it-katex";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
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
  MatchStep,
  ReplayStep,
  LeaderboardReplay,
  BlogPostItem,
  BlogPostDetail
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
  fetchMatchSteps,
  fetchRankBoard,
  fetchMyActiveMatch,
  fetchBlogPosts,
  fetchBlogPostDetail,
  fetchMyBlogPosts,
  deleteBlogPost,
  updateBlogPost,
  uploadBlogImage,
  createBlogPost,
  addBlogComment,
  voteBlogPost,
  fetchLeaderboardReplay
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
const THEME_OPTIONS = ["light", "dark", "forest", "sunset"] as const;
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
  const [view, setView] = useState<"solo" | "versus" | "profile" | "rank" | "blog">(() =>
    readStored(UI_VIEW_KEY, "solo", ["solo", "versus", "profile", "rank", "blog"])
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
  const [theme, setTheme] = useState<(typeof THEME_OPTIONS)[number]>(() => readStored(UI_THEME_KEY, "light", THEME_OPTIONS));
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
  const [rankBoard, setRankBoard] = useState<RankBoard | null>(null);
  const [rankError, setRankError] = useState<string | null>(null);
  const [loadingRank, setLoadingRank] = useState(false);
  const [blogPosts, setBlogPosts] = useState<BlogPostItem[]>([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogError, setBlogError] = useState<string | null>(null);
  const [blogDetail, setBlogDetail] = useState<BlogPostDetail | null>(null);
  const [blogDetailLoading, setBlogDetailLoading] = useState(false);
  const [blogDetailError, setBlogDetailError] = useState<string | null>(null);
  const [blogTitle, setBlogTitle] = useState("");
  const [blogContent, setBlogContent] = useState("");
  const [blogComment, setBlogComment] = useState("");
  const [blogSort, setBlogSort] = useState<"created" | "score">("created");
  const [myBlogPosts, setMyBlogPosts] = useState<BlogPostItem[]>([]);
  const [myBlogLoading, setMyBlogLoading] = useState(false);
  const [myBlogError, setMyBlogError] = useState<string | null>(null);
  const [blogEditing, setBlogEditing] = useState(false);
  const [blogEditTitle, setBlogEditTitle] = useState("");
  const [blogEditContent, setBlogEditContent] = useState("");
  const [blogImageUploading, setBlogImageUploading] = useState(false);
  const [soloReplaySteps, setSoloReplaySteps] = useState<ReplayStep[]>([]);
  const replayEntryId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const id = new URLSearchParams(window.location.search).get("replay");
    if (!id) return null;
    const num = Number(id);
    return Number.isNaN(num) ? null : num;
  }, []);

  const md = useMemo(() => {
    const instance = new MarkdownIt({ html: false, linkify: true, breaks: true });
    instance.use(markdownItKatex);
    return instance;
  }, []);

  const renderMarkdown = useCallback(
    (text: string) => {
      try {
        const raw = md.render(text);
        return DOMPurify.sanitize(raw);
      } catch (_err) {
        return text;
      }
    },
    [md]
  );
  const [soloDifficulty, setSoloDifficulty] = useState<DifficultyKey>(board.difficulty);
  const [versusDifficulty, setVersusDifficulty] = useState<DifficultyKey>("beginner");
  const [replayBoard, setReplayBoard] = useState<BoardState | null>(null);
  const [replayBase, setReplayBase] = useState<BoardState | null>(null);
  const [replaySteps, setReplaySteps] = useState<MatchStep[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [lbReplayBoard, setLbReplayBoard] = useState<BoardState | null>(null);
  const [lbReplayBase, setLbReplayBase] = useState<BoardState | null>(null);
  const [lbReplaySteps, setLbReplaySteps] = useState<ReplayStep[]>([]);
  const [lbReplayIndex, setLbReplayIndex] = useState(0);
  const [lbReplayPlaying, setLbReplayPlaying] = useState(false);
  const [lbReplayLoadingId, setLbReplayLoadingId] = useState<string | null>(null);
  const [lbReplayError, setLbReplayError] = useState<string | null>(null);
  const [lbReplayMeta, setLbReplayMeta] = useState<{ player: string; timeMs: number; difficulty: DifficultyKey } | null>(null);
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

  const elapsedMs = useMemo(() => {
    if (!boardForView.startedAt) return 0;
    const end = boardForView.endedAt ?? now;
    return Math.max(0, end - boardForView.startedAt);
  }, [boardForView.endedAt, boardForView.startedAt, now]);

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

  const resetSoloReplay = useCallback(() => {
    setSoloReplaySteps([]);
  }, []);

  const recordSoloStep = useCallback(
    (action: ReplayStep["action"], x: number, y: number) => {
      if (mode !== "solo") return;
      setSoloReplaySteps((prev) => [...prev, { action, x, y, elapsed_ms: elapsedMs }]);
    },
    [elapsedMs, mode]
  );

  const restartBoard = useCallback(() => {
    if (mode === "solo") resetSoloReplay();
    startFresh();
  }, [mode, resetSoloReplay, startFresh]);

  useEffect(() => {
    if (mode === "solo") {
      setDifficulty(soloDifficulty);
      restartBoard();
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
        restartBoard();
      }
    }
  }, [mode, restartBoard, soloDifficulty, versusDifficulty, vsMatch?.matchId]);

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

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (vsMatch) return;
    let cancelled = false;
    const resume = async () => {
      try {
        const active = await fetchMyActiveMatch(token);
        if (cancelled) return;
        if (!active.active || !active.match_id || !active.player_id || !active.player_token || !active.board) return;
        const safeStart = active.board.safe_start ?? active.board.safeStart ?? null;
        const boardConfig = {
          width: active.board.width,
          height: active.board.height,
          mines: active.board.mines,
          seed: active.board.seed,
          difficulty: (active.board.difficulty as DifficultyKey | null) ?? null,
          safe_start: safeStart
        };
        setMode("versus");
        setView("versus");
        setIsSpectator(false);
        setVsMatch({
          matchId: active.match_id,
          playerId: active.player_id,
          playerToken: active.player_token,
          board: { ...active.board, safeStart },
          status: active.status ?? "pending",
          countdown_secs: active.countdown_secs,
          hostId: active.host_id ?? null
        });
        applyBoardConfig(boardConfig);
        setVsStepCount(0);
        setVsProgressUploaded(false);
        setSelectedResultPlayerId(null);
        setSpectatorViewPlayerId(null);
        setSpectatorBoard(null);
        setSpectatorBoardError(null);
        setSpectatorBoardLoading(false);
        resetReplay();

        const state = await fetchMatchState(active.match_id);
        if (cancelled) return;
        setVsState(state);
        setVsInfo(`已恢復對局 #${active.match_id}`);
      } catch (e) {
        // no active session or fetch failed; ignore
      }
    };
    resume();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token, vsMatch]);

  const statusText = useMemo(() => {
    if (boardForView.status === "idle") return "未開始";
    if (boardForView.status === "won") return "你贏了！";
    if (boardForView.status === "lost") return mode === "versus" ? "你輸了" : "踩到雷 QQ";
    return "進行中";
  }, [boardForView.status, mode]);

  const computeReplayDelay = useCallback(
    <T extends { elapsed_ms?: number | null }>(stepsArr: T[], idx: number, speedFactor: number) => {
      const current = stepsArr[idx];
      if (!current) return 120 * speedFactor;
      const prevElapsed = idx === 0 ? 0 : stepsArr[idx - 1]?.elapsed_ms ?? 0;
      const currElapsed = current.elapsed_ms ?? prevElapsed + 200;
      const delta = Math.max(0, currElapsed - prevElapsed);
      const base = Math.max(70, Math.min(320, delta * 0.12));
      return base * speedFactor;
    },
    []
  );

  const cloneBoardState = useCallback((state: BoardState): BoardState => {
    return { ...state, cells: state.cells.map((c) => ({ ...c })) };
  }, []);

  const rebuildReplayBoard = useCallback(
    (base: BoardState | null, stepsArr: Array<ReplayStep | MatchStep>, targetIndex: number) => {
      if (!base) return null;
      const capped = Math.max(0, Math.min(targetIndex, stepsArr.length));
      let next = cloneBoardState(base);
      for (let i = 0; i < capped; i += 1) {
        const step = stepsArr[i];
        next = applyReplayStep(next, step as any);
      }
      return next;
    },
    [cloneBoardState]
  );

  const resetLeaderboardReplay = useCallback(() => {
    setLbReplayBoard(null);
    setLbReplayBase(null);
    setLbReplaySteps([]);
    setLbReplayIndex(0);
    setLbReplayPlaying(false);
    setLbReplayMeta(null);
  }, []);

  const replaySpeedFactor = useMemo(() => {
    if (replaySpeed <= 0) return 1;
    return 1 / replaySpeed;
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
    loadMyBlogPosts();
  }, [view, isAuthenticated, token]);

  useEffect(() => {
    if (view !== "rank") return;
    let cancelled = false;
    const loadRank = async () => {
      try {
        setLoadingRank(true);
        setRankError(null);
        const data = await fetchRankBoard();
        if (!cancelled) setRankBoard(data);
      } catch (e) {
        if (!cancelled) setRankError(e instanceof Error ? e.message : "讀取排行失敗");
      } finally {
        if (!cancelled) setLoadingRank(false);
      }
    };
    loadRank();
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    if (view !== "blog") return;
    let cancelled = false;
    const loadBlog = async () => {
      try {
        setBlogLoading(true);
        setBlogError(null);
        const data = await fetchBlogPosts(blogSort);
        if (!cancelled) {
          setBlogPosts(data);
          setBlogDetail(null);
        }
      } catch (e) {
        if (!cancelled) setBlogError(e instanceof Error ? e.message : "讀取文章失敗");
      } finally {
        if (!cancelled) setBlogLoading(false);
      }
    };
    loadBlog();
    return () => {
      cancelled = true;
    };
  }, [view, blogSort]);

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
    const run = async () => {
      try {
        setSubmitting(true);
        setError(null);
        await submitScore({
          difficulty: board.difficulty,
          timeMs: elapsedMs,
          token,
          replay: {
            board: { width: board.width, height: board.height, mines: board.mines, seed: board.seed, safe_start: board.safeStart ?? null },
            steps: soloReplaySteps,
            duration_ms: elapsedMs
          }
        });
        await loadLeaderboard(board.difficulty);
        await refreshProfile();
        if (!cancelled) setAutoSubmitted(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "提交失敗");
          setAutoSubmitted(false);
        }
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    };
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
      restartBoard();
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
      restartBoard();
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
      await submitScore({
        difficulty: board.difficulty,
        timeMs: elapsedMs,
        token,
        replay: {
          board: { width: board.width, height: board.height, mines: board.mines, seed: board.seed, safe_start: board.safeStart ?? null },
          steps: soloReplaySteps,
          duration_ms: elapsedMs
        }
      });
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
        await submitScore({
          difficulty: board.difficulty,
          timeMs: elapsedMs,
          token,
          replay: {
            board: { width: board.width, height: board.height, mines: board.mines, seed: board.seed, safe_start: board.safeStart ?? null },
            steps: soloReplaySteps,
            duration_ms: elapsedMs
          }
        });
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
  }, [autoSubmitted, board.difficulty, board.endedAt, board.startedAt, board.status, elapsedMs, isAuthenticated, token, currentUser, submitting, soloReplaySteps]);

  useEffect(() => {
    if (selectedResultPlayerId === null) return;
    resetReplay();
  }, [selectedResultPlayerId, vsMatch?.matchId]);

  useEffect(() => {
    if (mode !== "versus") return;
    if (vsState?.status === "finished" && !isSpectator) {
      setIsSpectator(true);
    }
  }, [mode, vsState?.status, isSpectator]);

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
    const delay = computeReplayDelay(replaySteps, replayIndex, replaySpeedFactor);
    const timer = setTimeout(() => {
      const step = replaySteps[replayIndex];
      setReplayBoard((prev) => (prev ? applyReplayStep(prev, step) : prev));
      setReplayIndex((i) => i + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [computeReplayDelay, replayIndex, replayPlaying, replayBoard, replaySpeedFactor, replaySteps]);

  useEffect(() => {
    if (!lbReplayPlaying) return;
    if (!lbReplayBoard) return;
    if (lbReplayIndex >= lbReplaySteps.length) {
      setLbReplayPlaying(false);
      return;
    }
    const delay = computeReplayDelay(lbReplaySteps, lbReplayIndex, replaySpeedFactor);
    const timer = setTimeout(() => {
      const step = lbReplaySteps[lbReplayIndex];
      setLbReplayBoard((prev) => (prev ? applyReplayStep(prev, step as any) : prev));
      setLbReplayIndex((i) => i + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [computeReplayDelay, lbReplayBoard, lbReplayIndex, lbReplayPlaying, lbReplaySteps, replaySpeedFactor]);

  useEffect(() => {
    if (!replayEntryId) return;
    startLeaderboardReplay(replayEntryId);
  }, [replayEntryId]);

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
      setIsSpectator(false);
      setVsMatch({ ...session, status: "pending" });
      setVsName(displayName);
      setVsState(null);
      setSpectateId("");
      setVsStepCount(0);
      setVsProgressUploaded(false);
      setSelectedResultPlayerId(null);
      setSpectatorViewPlayerId(null);
      setSpectatorBoard(null);
      setSpectatorBoardError(null);
      setSpectatorBoardLoading(false);
      resetReplay();
      applyBoardConfig(session.board);
      setVsInfo(`已建立對局，分享 ID: ${session.matchId}`);
    } catch (e) {
      setVsError(e instanceof Error ? e.message : "建立失敗");
    }
  };

  const handleJoinMatch = async (targetId?: number) => {
    if (vsMatch && !isSpectator && vsState?.status !== "finished") {
      setVsError("已在對局中，請先退出或等待結束");
      return;
    }
    clearSpectateView();
    setVsMatch(null);
    setVsState(null);
    const idNum = targetId ?? Number(joinId);
    if (!idNum || Number.isNaN(idNum)) {
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
      setIsSpectator(false);
      setVsMatch(session);
      setVsName(displayName);
      setVsState(null);
      setSpectateId("");
      setVsStepCount(0);
      setVsProgressUploaded(false);
      setSelectedResultPlayerId(null);
      setSpectatorViewPlayerId(null);
      setSpectatorBoard(null);
      setSpectatorBoardError(null);
      setSpectatorBoardLoading(false);
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
    restartBoard();
    localStorage.removeItem(VS_SESSION_KEY);
  };

  const handleSpectate = async (targetId?: number) => {
    const idNum = targetId ?? Number(spectateId);
    if (!idNum || Number.isNaN(idNum)) {
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
      setVsName("");
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

  const startLeaderboardReplay = async (entryOrId: LeaderboardEntry | number) => {
    const entryId = typeof entryOrId === "number" ? entryOrId : Number(entryOrId.id);
    const fallbackPlayer = typeof entryOrId === "number" ? null : entryOrId.player;
    const fallbackDiff = typeof entryOrId === "number" ? null : entryOrId.difficulty;
    const fallbackTime = typeof entryOrId === "number" ? null : entryOrId.timeMs;

    resetLeaderboardReplay();
    setLbReplayError(null);
    setLbReplayLoadingId(String(entryId));
    try {
      const data = await fetchLeaderboardReplay(Number(entryId));
      const diff = (data.difficulty as DifficultyKey | null) ?? fallbackDiff ?? "beginner";
      const base = createEmptyState(diff, {
        width: data.board.width,
        height: data.board.height,
        mines: data.board.mines,
        seed: data.board.seed,
        safeStart: data.board.safe_start ?? null,
      });
      const baseCloned = cloneBoardState(base);
      setLbReplayBase(baseCloned);
      setLbReplayBoard(cloneBoardState(baseCloned));
      setLbReplaySteps(data.steps);
      setLbReplayIndex(0);
      setLbReplayMeta({ player: data.player ?? fallbackPlayer ?? "", timeMs: data.time_ms ?? fallbackTime ?? 0, difficulty: diff as DifficultyKey });
      setLbReplayPlaying(true);
    } catch (e) {
      setLbReplayError(e instanceof Error ? e.message : "讀取回放失敗");
    } finally {
      setLbReplayLoadingId(null);
    }
  };

  const scrubLbReplay = useCallback(
    (targetIndex: number) => {
      const next = rebuildReplayBoard(lbReplayBase, lbReplaySteps as any[], targetIndex);
      setLbReplayBoard(next);
      setLbReplayIndex(targetIndex);
      setLbReplayPlaying(false);
    },
    [lbReplayBase, lbReplaySteps, rebuildReplayBoard]
  );

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

      if (spectatorBoardLoading) return;
      setSpectatorBoardLoading(true);
      setSpectatorBoardError(null);
      try {
        let nextBoard: BoardState;
        if (player.progress?.board) {
          nextBoard = player.progress.board as BoardState;
        } else {
          const steps = await fetchMatchSteps(vsMatch.matchId);
          const filtered = steps.filter((s) => s.player_name === player.name);
          nextBoard = filtered.reduce((state, step) => applyReplayStep(state, step), baseBoard);
        }

        const startedAtMs = parseUtcMillis(currentState.started_at) ?? nextBoard.startedAt ?? null;
        const finishedMs = parseUtcMillis(player.finished_at as string | undefined) ?? parseUtcMillis(currentState.ended_at) ?? nextBoard.endedAt ?? null;
        let status = nextBoard.status;
        if (player.result === "win") status = "won";
        else if (player.result === "lose" || player.result === "forfeit") status = "lost";
        else if (startedAtMs && !finishedMs) status = "playing";

        nextBoard = {
          ...nextBoard,
          startedAt: startedAtMs,
          endedAt: finishedMs,
          status,
        };

        setSpectatorBoard(nextBoard);
      } catch (e) {
        setSpectatorBoardError(e instanceof Error ? e.message : "載入觀戰棋盤失敗");
        setSpectatorBoard(null);
      } finally {
        setSpectatorBoardLoading(false);
      }
    },
    [isSpectator, spectatorBoardLoading, spectatorViewPlayerId, vsMatch?.matchId, versusDifficulty]
  );

  useEffect(() => {
    if (!isSpectator || spectatorViewPlayerId === null) return;
    loadSpectatorBoard(spectatorViewPlayerId);
  }, [isSpectator, loadSpectatorBoard, spectatorViewPlayerId, vsMatch?.matchId, vsState?.status]);

  useEffect(() => {
    if (!isSpectator || !vsMatch) return;
    // Active/pending: poll for live updates; finished: single refresh.
    const status = vsState?.status;
    if (status === "finished") {
      if (!spectatorBoard && !spectatorBoardLoading) {
        loadSpectatorBoard(spectatorViewPlayerId ?? undefined);
      }
      return;
    }
    const tick = () => {
      if (spectatorBoardLoading) return;
      loadSpectatorBoard(spectatorViewPlayerId ?? undefined);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [isSpectator, vsMatch?.matchId, vsState?.status, spectatorViewPlayerId, spectatorBoardLoading, spectatorBoard, loadSpectatorBoard]);

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

      const baseCloned = cloneBoardState(baseBoard);
      setReplayBase(baseCloned);
      setReplayBoard(cloneBoardState(baseCloned));
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
    if (mode === "solo") {
      recordSoloStep("reveal", x, y);
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
    if (mode === "solo") {
      recordSoloStep("flag", x, y);
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
    if (mode === "solo") {
      recordSoloStep("chord", x, y);
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
    setReplayBase(null);
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

  useEffect(() => {
    if (mode === "solo" && isSpectator) {
      clearSpectateView();
      restartBoard();
    }
  }, [mode, isSpectator, clearSpectateView, restartBoard]);

  const toggleTheme = (next?: (typeof THEME_OPTIONS)[number]) => {
    if (next) return setTheme(next);
    // fallback: cycle
    setTheme((t) => {
      const idx = THEME_OPTIONS.indexOf(t);
      return THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length];
    });
  };

  const reloadBlogPosts = async (nextSort?: "created" | "score") => {
    if (nextSort && nextSort !== blogSort) {
      setBlogSort(nextSort);
      return;
    }
    try {
      setBlogLoading(true);
      setBlogError(null);
      const sort = nextSort ?? blogSort;
      const data = await fetchBlogPosts(sort);
      setBlogPosts(data);
    } catch (e) {
      setBlogError(e instanceof Error ? e.message : "讀取文章失敗");
    } finally {
      setBlogLoading(false);
    }
  };

  const loadMyBlogPosts = async () => {
    if (!isAuthenticated || !token) return;
    try {
      setMyBlogLoading(true);
      setMyBlogError(null);
      const data = await fetchMyBlogPosts(token);
      setMyBlogPosts(data);
    } catch (e) {
      setMyBlogError(e instanceof Error ? e.message : "讀取我的文章失敗");
    } finally {
      setMyBlogLoading(false);
    }
  };

  const handleOpenBlogPost = async (postId: number, startEdit = false) => {
    setBlogDetailLoading(true);
    setBlogDetailError(null);
    setBlogEditing(false);
    try {
      const detail = await fetchBlogPostDetail(postId, token ?? undefined);
      setBlogDetail(detail);
      if (startEdit && currentUser?.handle === detail.author) {
        setBlogEditTitle(detail.title);
        setBlogEditContent(detail.content);
        setBlogEditing(true);
      }
    } catch (e) {
      setBlogDetailError(e instanceof Error ? e.message : "讀取文章失敗");
    } finally {
      setBlogDetailLoading(false);
    }
  };

  const handleCreateBlogPost = async () => {
    if (!isAuthenticated || !token) {
      setBlogError("請先登入再發文");
      return;
    }
    if (!blogTitle.trim() || !blogContent.trim()) {
      setBlogError("標題與內容不可為空");
      return;
    }
    try {
      setBlogError(null);
      const created = await createBlogPost({ title: blogTitle, content: blogContent, token });
      setBlogPosts((prev) => [created, ...prev]);
      setBlogTitle("");
      setBlogContent("");
      await handleOpenBlogPost(created.id);
    } catch (e) {
      setBlogError(e instanceof Error ? e.message : "新增文章失敗");
    }
  };

  const handleStartEditBlog = () => {
    if (!blogDetail) return;
    setBlogEditTitle(blogDetail.title);
    setBlogEditContent(blogDetail.content);
    setBlogEditing(true);
  };

  const handleCancelEditBlog = () => {
    setBlogEditing(false);
    setBlogDetailError(null);
  };

  const handleSaveEditBlog = async () => {
    if (!blogDetail) return;
    if (!isAuthenticated || !token) {
      setBlogDetailError("請先登入再編輯文章");
      return;
    }
    if (!blogEditTitle.trim() || !blogEditContent.trim()) {
      setBlogDetailError("標題與內容不可為空");
      return;
    }
    try {
      setBlogDetailError(null);
      const updated = await updateBlogPost(blogDetail.id, { title: blogEditTitle, content: blogEditContent, token });
      setBlogDetail((prev) => (prev ? { ...prev, ...updated, comments: prev.comments } : prev));
      setBlogPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      setMyBlogPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      setBlogEditing(false);
    } catch (e) {
      setBlogDetailError(e instanceof Error ? e.message : "更新文章失敗");
    }
  };

  const handleUploadImage = async (file: File, mode: "create" | "edit") => {
    if (!isAuthenticated || !token) {
      setBlogError("請先登入再上傳圖片");
      return;
    }
    try {
      setBlogImageUploading(true);
      const { url, absolute_url } = await uploadBlogImage(file, token);
      const link = absolute_url || url;
      const snippet = `\n![](${link})\n`;
      if (mode === "create") {
        setBlogContent((prev) => prev + snippet);
      } else {
        setBlogEditContent((prev) => prev + snippet);
      }
    } catch (e) {
      setBlogError(e instanceof Error ? e.message : "上傳圖片失敗");
    } finally {
      setBlogImageUploading(false);
    }
  };

  const handleAddBlogComment = async () => {
    if (!blogDetail) return;
    if (!isAuthenticated || !token) {
      setBlogDetailError("請先登入再留言");
      return;
    }
    if (!blogComment.trim()) {
      setBlogDetailError("留言不可為空");
      return;
    }
    try {
      setBlogDetailError(null);
      const comment = await addBlogComment(blogDetail.id, { content: blogComment, token });
      setBlogDetail((prev) => (prev ? { ...prev, comments: [...prev.comments, comment], comment_count: prev.comment_count + 1 } : prev));
      setBlogComment("");
    } catch (e) {
      setBlogDetailError(e instanceof Error ? e.message : "新增留言失敗");
    }
  };

  const handleVoteBlogPost = async (postId: number, value: -1 | 0 | 1, current?: number | null) => {
    if (!isAuthenticated || !token) {
      setBlogError("請先登入再投票");
      return;
    }
    const nextValue: -1 | 0 | 1 = current === value ? 0 : value;
    try {
      const updated = await voteBlogPost(postId, { value: nextValue, token });
      setBlogPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...updated } : p)));
      setBlogDetail((prev) => (prev && prev.id === postId ? { ...prev, ...updated, comments: prev.comments } : prev));
    } catch (e) {
      setBlogError(e instanceof Error ? e.message : "投票失敗");
    }
  };

  const handleDeleteBlogPost = async (postId: number) => {
    if (!isAuthenticated || !token) {
      setBlogError("請先登入再刪除文章");
      return;
    }
    try {
      await deleteBlogPost(postId, token);
      setBlogPosts((prev) => prev.filter((p) => p.id !== postId));
      setMyBlogPosts((prev) => prev.filter((p) => p.id !== postId));
      setBlogDetail((prev) => (prev && prev.id === postId ? null : prev));
    } catch (e) {
      setBlogError(e instanceof Error ? e.message : "刪除文章失敗");
    }
  };

  const scrubVsReplay = useCallback(
    (targetIndex: number) => {
      const next = rebuildReplayBoard(replayBase, replaySteps, targetIndex);
      setReplayBoard(next);
      setReplayIndex(targetIndex);
      setReplayPlaying(false);
    },
    [replayBase, replaySteps, rebuildReplayBoard]
  );

  if (replayEntryId) {
    const boardToShow = lbReplayBoard ?? lbReplayBase;
    const totalSteps = lbReplaySteps.length;
    return (
      <div className="min-h-screen bg-[var(--app-bg, #0f172a)] text-[var(--text-primary)]">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] opacity-70">Leaderboard Replay</p>
              <h1 className="text-3xl font-bold tracking-tight">回放 #{replayEntryId}</h1>
              {lbReplayMeta && (
                <p className="text-sm opacity-80">
                  玩家 {lbReplayMeta.player} · 難度 {lbReplayMeta.difficulty} · {formatMs(lbReplayMeta.timeMs)} 秒
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => startLeaderboardReplay(replayEntryId)}
                className="px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--surface-strong)]"
              >
                重新載入
              </button>
              <button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("replay");
                  window.location.href = url.toString();
                }}
                className="px-4 py-2 rounded-full bg-[var(--accent)] text-white"
              >
                返回主頁
              </button>
            </div>
          </div>

          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow p-5 space-y-4">
            {lbReplayLoadingId ? (
              <p className="text-sm opacity-80">載入回放中...</p>
            ) : lbReplayError ? (
              <div className="space-y-2">
                <p className="text-sm text-red-600">{lbReplayError}</p>
                <button
                  onClick={() => startLeaderboardReplay(replayEntryId)}
                  className="px-3 py-2 rounded border border-[var(--border)] bg-[var(--surface-strong)]"
                >
                  重試載入
                </button>
              </div>
            ) : !boardToShow ? (
              <p className="text-sm opacity-70">沒有可播放的棋盤資料</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="text-sm opacity-80">
                    {lbReplayMeta ? (
                      <span>
                        {lbReplayMeta.player} · {lbReplayMeta.difficulty} · {formatMs(lbReplayMeta.timeMs)} 秒
                      </span>
                    ) : (
                      <span>排行榜回放</span>
                    )}
                    <span className="ml-3 text-xs">
                      步驟 {Math.min(lbReplayIndex, totalSteps)} / {totalSteps}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <button
                      onClick={() => {
                        if (!lbReplayBase) return;
                        if (totalSteps === 0) return;
                        if (lbReplayPlaying) {
                          setLbReplayPlaying(false);
                          return;
                        }
                        if (lbReplayIndex >= totalSteps) {
                          const resetBoard = rebuildReplayBoard(lbReplayBase, lbReplaySteps as any[], 0);
                          setLbReplayBoard(resetBoard);
                          setLbReplayIndex(0);
                        }
                        setLbReplayPlaying(true);
                      }}
                      disabled={!lbReplayBase}
                      className="px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-strong)] disabled:opacity-60"
                    >
                      {lbReplayPlaying
                        ? "暫停"
                        : totalSteps === 0
                        ? "播放"
                        : lbReplayIndex >= totalSteps
                        ? "重播"
                        : lbReplayIndex > 0
                        ? "繼續"
                        : "播放"}
                    </button>
                    <label className="flex items-center gap-2 text-xs opacity-80">
                      <span>速度 {replaySpeed.toFixed(1)}x</span>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={replaySpeed}
                        onChange={(e) => setReplaySpeed(Number(e.target.value))}
                        className="accent-[var(--accent)]"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs opacity-80">
                      <span>進度</span>
                      <input
                        type="range"
                        min="0"
                        max={totalSteps}
                        step="1"
                        value={Math.min(lbReplayIndex, totalSteps)}
                        onChange={(e) => scrubLbReplay(Number(e.target.value))}
                        className="accent-[var(--accent)]"
                      />
                      <span className="tabular-nums text-[11px]">{Math.min(lbReplayIndex, totalSteps)} / {totalSteps}</span>
                    </label>
                  </div>
                </div>
                <div className="max-w-full overflow-auto">
                  <Board board={boardToShow} onReveal={() => {}} onFlag={() => {}} onChord={() => {}} maxWidth={1000} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 text-[var(--text-primary)]">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">踩地雷</h1>
          <p className="text-sm opacity-80">
            {view === "solo" && "單人模式"}
            {view === "versus" && "對戰模式"}
            {view === "profile" && "個人主頁（最高分與對戰紀錄）"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => {
              clearSpectateView();
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
            onClick={() => setView("rank")}
            className={`px-3 py-2 rounded-full text-sm border ${
              view === "rank" ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface-strong)] border-[var(--border)]"
            }`}
          >
            Rank
          </button>
          <button
            onClick={() => setView("blog")}
            className={`px-3 py-2 rounded-full text-sm border ${
              view === "blog" ? "bg-[var(--accent)] text-white border-transparent" : "bg-[var(--surface-strong)] border-[var(--border)]"
            }`}
          >
            Blog
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="opacity-70">主題</span>
            <select
              value={theme}
              onChange={(e) => toggleTheme(e.target.value as (typeof THEME_OPTIONS)[number])}
              className="px-3 py-2 rounded-full border bg-[var(--surface-strong)] border-[var(--border)] text-sm"
              aria-label="切換主題"
            >
              <option value="light">晨光</option>
              <option value="dark">夜幕</option>
              <option value="forest">林間</option>
              <option value="sunset">暮色</option>
            </select>
          </div>
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
                        <li
                          key={`${b.difficulty}-${b.time_ms}`}
                          className="flex items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{b.difficulty}</span>
                            <span className="text-xs opacity-70">{new Date(b.created_at).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{formatMs(b.time_ms)} s</span>
                            {b.has_replay ? (
                              <button
                                onClick={() => {
                                  const url = new URL(window.location.href);
                                  url.searchParams.set("replay", String(b.entry_id));
                                  window.open(url.toString(), "_blank");
                                }}
                                className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-xs"
                              >
                                查看回放
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold mb-2">名次統計</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 flex items-center justify-between">
                      <span>#1</span>
                      <span className="font-semibold">{profile.rank_counts.first}</span>
                    </div>
                    <div className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 flex items-center justify-between">
                      <span>#2</span>
                      <span className="font-semibold">{profile.rank_counts.second}</span>
                    </div>
                    <div className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 flex items-center justify-between">
                      <span>#3</span>
                      <span className="font-semibold">{profile.rank_counts.third}</span>
                    </div>
                    <div className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 flex items-center justify-between">
                      <span>最後一名</span>
                      <span className="font-semibold">{profile.rank_counts.last}</span>
                    </div>
                  </div>
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
                          <div className="mt-2">
                            <button
                              onClick={() => {
                                setMode("versus");
                                setView("versus");
                                setSpectateId(String(m.match_id));
                                handleSpectate(m.match_id);
                              }}
                              className="px-3 py-1 rounded-full text-xs border border-[var(--border)] bg-[var(--surface)]"
                            >
                              觀看
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">我的文章</h3>
                    <button
                      onClick={loadMyBlogPosts}
                      className="text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-strong)]"
                    >
                      重新整理
                    </button>
                  </div>
                  {myBlogError && <p className="text-sm text-red-600">{myBlogError}</p>}
                  {myBlogLoading ? (
                    <p className="text-sm opacity-70">載入中...</p>
                  ) : myBlogPosts.length === 0 ? (
                    <p className="text-sm opacity-70">尚未發表文章</p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {myBlogPosts.map((p) => (
                        <div key={p.id} className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold">{p.title}</div>
                              <div className="text-xs opacity-70">{new Date(p.created_at).toLocaleString()}</div>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span>👍 {p.upvotes}</span>
                              <span>👎 {p.downvotes}</span>
                              <span>留言 {p.comment_count}</span>
                            </div>
                          </div>
                          <div className="mt-2 flex gap-2 text-xs">
                            <button
                              onClick={() => {
                                setView("blog");
                                handleOpenBlogPost(p.id);
                              }}
                              className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)]"
                            >
                              查看
                            </button>
                            <button
                              onClick={() => {
                                setView("blog");
                                handleOpenBlogPost(p.id, true);
                              }}
                              className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)]"
                            >
                              編輯
                            </button>
                            <button
                              onClick={() => handleDeleteBlogPost(p.id)}
                              className="px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700"
                            >
                              刪除
                            </button>
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
      ) : view === "rank" ? (
        <section className="space-y-4">
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Rank (積分制)</h2>
              <span className="text-xs opacity-70">前 20 名</span>
            </div>
            {loadingRank ? (
              <p className="text-sm opacity-70">載入中...</p>
            ) : rankError ? (
              <p className="text-sm text-red-600">{rankError}</p>
            ) : rankBoard && rankBoard.top.length > 0 ? (
              <ol className="space-y-2 text-sm">
                {rankBoard.top.map((r, idx) => (
                  <li
                    key={`${r.handle}-${idx}`}
                    className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs w-6">#{idx + 1}</span>
                      <span className="font-semibold">{r.handle}</span>
                    </div>
                    <span className="font-mono">{r.score}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm opacity-70">暫無資料</p>
            )}

            {rankBoard?.me && (
              <div className="mt-3 rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm flex items-center justify-between">
                <span className="opacity-70">你的積分</span>
                <span className="font-semibold">{rankBoard.me.score}</span>
              </div>
            )}
          </div>
        </section>
      ) : view === "blog" ? (
        <section className="space-y-4">
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Blog 發文</h2>
              {!isAuthenticated && <span className="text-xs text-red-600">登入後才能發文</span>}
            </div>
            {blogError && <p className="text-sm text-red-600">{blogError}</p>}
            <input
              value={blogTitle}
              onChange={(e) => setBlogTitle(e.target.value)}
              placeholder="標題"
              className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
              maxLength={200}
              disabled={!isAuthenticated}
            />
            <textarea
              value={blogContent}
              onChange={(e) => setBlogContent(e.target.value)}
              placeholder="內容"
              className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)] min-h-[120px]"
              maxLength={5000}
              disabled={!isAuthenticated}
            />
            <div className="flex items-center justify-between text-xs opacity-80">
              <span>支援 Markdown / LaTeX，圖片可上傳插入</span>
              <label className="inline-flex items-center gap-2 px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-strong)] cursor-pointer text-xs">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!isAuthenticated || blogImageUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadImage(file, "create");
                    e.target.value = "";
                  }}
                />
                <span>{blogImageUploading ? "上傳中..." : "上傳圖片"}</span>
              </label>
            </div>
            <button
              onClick={handleCreateBlogPost}
              disabled={!isAuthenticated}
              className="w-full rounded bg-[var(--accent-strong)] text-white py-2 disabled:opacity-60"
            >
              發佈文章
            </button>
          </div>

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">文章列表</h2>
              <div className="flex items-center gap-2 text-xs">
                <label className="opacity-70">排序</label>
                <select
                  value={blogSort}
                  onChange={(e) => reloadBlogPosts(e.target.value as "created" | "score")}
                  className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1"
                >
                  <option value="created">最新</option>
                  <option value="score">熱門 (Upvote)</option>
                </select>
                <button
                  onClick={() => reloadBlogPosts()}
                  className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-strong)]"
                >
                  重新整理
                </button>
              </div>
            </div>
            {blogLoading ? (
              <p className="text-sm opacity-70">載入中...</p>
            ) : blogPosts.length === 0 ? (
              <p className="text-sm opacity-70">尚無文章</p>
            ) : (
              <div className="space-y-2">
                {blogPosts.map((p) => (
                  <div key={p.id} className="rounded border border-[var(--border)] bg-[var(--surface-strong)] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">{p.title}</div>
                        <div className="text-xs opacity-70">{p.author} · {new Date(p.created_at).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          onClick={() => handleVoteBlogPost(p.id, 1, p.my_vote ?? null)}
                          className={`px-2 py-1 rounded border ${p.my_vote === 1 ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)] bg-[var(--surface)]"}`}
                        >
                          👍 {p.upvotes}
                        </button>
                        <button
                          onClick={() => handleVoteBlogPost(p.id, -1, p.my_vote ?? null)}
                          className={`px-2 py-1 rounded border ${p.my_vote === -1 ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)] bg-[var(--surface)]"}`}
                        >
                          👎 {p.downvotes}
                        </button>
                        <span className="text-xs opacity-70">留言 {p.comment_count}</span>
                      </div>
                    </div>
                    <div
                      className="text-sm opacity-80 leading-relaxed space-y-1"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(p.content.slice(0, 220)) }}
                    />
                    <div className="flex gap-2 text-sm">
                      <button
                        onClick={() => handleOpenBlogPost(p.id)}
                        className="px-3 py-1 rounded border border-[var(--border)] bg-[var(--surface)]"
                      >
                        查看留言
                      </button>
                      {currentUser?.handle === p.author && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenBlogPost(p.id, true)}
                            className="px-3 py-1 rounded border border-[var(--border)] bg-[var(--surface)]"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDeleteBlogPost(p.id)}
                            className="px-3 py-1 rounded border border-red-200 bg-red-50 text-red-700"
                          >
                            刪除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">文章內容 / 留言</h2>
              {blogDetailLoading && <span className="text-xs opacity-70">載入中...</span>}
            </div>
            {blogDetailError && <p className="text-sm text-red-600">{blogDetailError}</p>}
            {!blogDetail ? (
              <p className="text-sm opacity-70">點擊上方「查看留言」以閱讀完整文章</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xl font-semibold">{blogDetail.title}</div>
                    <div className="text-xs opacity-70">{blogDetail.author} · {new Date(blogDetail.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm flex-wrap justify-end">
                    {currentUser?.handle === blogDetail.author && (
                      !blogEditing ? (
                        <button
                          onClick={handleStartEditBlog}
                          className="px-3 py-1 rounded border border-[var(--border)] bg-[var(--surface-strong)]"
                        >
                          編輯
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEditBlog}
                            className="px-3 py-1 rounded border border-[var(--border)] bg-[var(--accent-strong)] text-white"
                          >
                            保存
                          </button>
                          <button
                            onClick={handleCancelEditBlog}
                            className="px-3 py-1 rounded border border-[var(--border)] bg-[var(--surface-strong)]"
                          >
                            取消
                          </button>
                        </div>
                      )
                    )}
                    <button
                      onClick={() => handleVoteBlogPost(blogDetail.id, 1, blogDetail.my_vote ?? null)}
                      className={`px-3 py-1 rounded border ${blogDetail.my_vote === 1 ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)] bg-[var(--surface-strong)]"}`}
                    >
                      👍 {blogDetail.upvotes}
                    </button>
                    <button
                      onClick={() => handleVoteBlogPost(blogDetail.id, -1, blogDetail.my_vote ?? null)}
                      className={`px-3 py-1 rounded border ${blogDetail.my_vote === -1 ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)] bg-[var(--surface-strong)]"}`}
                    >
                      👎 {blogDetail.downvotes}
                    </button>
                  </div>
                </div>
                {blogEditing ? (
                  <div className="space-y-2">
                    <input
                      value={blogEditTitle}
                      onChange={(e) => setBlogEditTitle(e.target.value)}
                      maxLength={200}
                      className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)]"
                    />
                    <textarea
                      value={blogEditContent}
                      onChange={(e) => setBlogEditContent(e.target.value)}
                      maxLength={5000}
                      className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)] min-h-[160px]"
                    />
                    <div className="flex items-center justify-between text-xs opacity-80">
                      <span>支援 Markdown / LaTeX</span>
                      <label className="inline-flex items-center gap-2 px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-strong)] cursor-pointer text-xs">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={blogImageUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadImage(file, "edit");
                            e.target.value = "";
                          }}
                        />
                        <span>{blogImageUploading ? "上傳中..." : "上傳圖片"}</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div
                    className="leading-relaxed bg-[var(--surface-strong)] border border-[var(--border)] rounded-lg p-3 space-y-2 text-sm"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(blogDetail.content) }}
                  />
                )}
                <div className="space-y-2">
                  <div className="font-semibold">留言 ({blogDetail.comment_count})</div>
                  {blogDetail.comments.length === 0 ? (
                    <p className="text-sm opacity-70">尚無留言</p>
                  ) : (
                    <div className="space-y-2">
                      {blogDetail.comments.map((c) => (
                        <div key={c.id} className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{c.author}</span>
                            <span className="text-xs opacity-70">{new Date(c.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap mt-1">{c.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 space-y-2">
                    {!isAuthenticated && <p className="text-sm text-red-600">登入後才能留言</p>}
                    <textarea
                      value={blogComment}
                      onChange={(e) => setBlogComment(e.target.value)}
                      placeholder="寫下你的留言"
                      className="w-full rounded border border-[var(--border)] px-3 py-2 bg-[var(--surface-strong)] min-h-[80px]"
                      disabled={!isAuthenticated}
                    />
                    <button
                      onClick={handleAddBlogComment}
                      disabled={!isAuthenticated}
                      className="px-3 py-2 rounded bg-[var(--accent-strong)] text-white disabled:opacity-60"
                    >
                      送出留言
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="grid md:grid-cols-[auto,320px] gap-8 items-start justify-center">
            <div className="space-y-3 flex flex-col items-center">
              <div className="flex flex-wrap items-center gap-3 justify-center">
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

              <div className="w-full overflow-auto">
                <div className="relative inline-block">
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
                      </div>
                      <button
                        onClick={restartBoard}
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
                            <div className="flex items-center gap-2">
                              <div className="font-mono text-sm">{formatMs(entry.timeMs)} s</div>
                              <button
                                onClick={() => {
                                  if (!entry.hasReplay) return;
                                  const url = new URL(window.location.href);
                                  url.searchParams.set("replay", String(entry.id));
                                  window.open(url.toString(), "_blank");
                                }}
                                disabled={!entry.hasReplay}
                                className={`px-2 py-1 rounded border text-xs ${
                                  entry.hasReplay
                                    ? "bg-[var(--surface-strong)] border-[var(--border)]"
                                    : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                                }`}
                              >
                                {entry.hasReplay ? "回放頁" : "無回放"}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  {(lbReplayBoard || lbReplayError) && null}
                </>
              ) : (
                <>
                  <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow p-4 space-y-3">
                    <h2 className="text-lg font-semibold">對戰設定</h2>
                    <div className="rounded border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="opacity-70">對戰難度（僅影響新對局）</span>
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
                                {p.rank ? <span className="font-mono">#{p.rank}</span> : null}
                                <span>{vsState?.host_id === p.id ? "-" : p.ready ? "已準備" : "未準備"}</span>
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
                              {(() => {
                                const label =
                                  m.status === "pending" ? "等待開始" : m.status === "active" ? "進行中" : "已結束";
                                const tone =
                                  m.status === "pending"
                                    ? "bg-amber-100 text-amber-700 border-amber-200"
                                    : m.status === "active"
                                    ? "bg-sky-100 text-sky-700 border-sky-200"
                                    : "bg-emerald-100 text-emerald-700 border-emerald-200";
                                return <span className={`px-2 py-0.5 rounded-full text-xs border ${tone}`}>{label}</span>;
                              })()}
                            </div>
                            <div className="text-xs opacity-80">
                              {m.width}x{m.height} / {m.mines} 雷
                            </div>
                            {m.status === "pending" && m.players.length > 0 && m.players[0]?.ready && m.players[1]?.ready && (
                              <div className="text-xs text-yellow-500">已同步起始點，雙方請踩指定開局格</div>
                            )}
                            {m.status === "pending" ? (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {m.players.map((p) => (
                                  <span
                                    key={`${m.match_id}-${p.id}`}
                                    className={`px-2 py-1 rounded-full text-xs border ${
                                      p.ready
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                        : "border-amber-300 bg-amber-50 text-amber-700"
                                    }`}
                                  >
                                    {p.is_host ? "房主 · " : ""}
                                    {p.name}：{p.ready ? "已準備" : "未準備"}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {m.players.map((p) => (
                                  <span
                                    key={`${m.match_id}-${p.id}`}
                                    className="px-2 py-1 rounded-full text-xs border border-[var(--border)] bg-[var(--surface)]"
                                  >
                                    {p.is_host ? "房主 · " : ""}
                                    {p.name}：{renderResult(p.result, m.status)}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {m.status === "pending" && isAuthenticated && (
                                <button
                                  onClick={() => {
                                    setMode("versus");
                                    setView("versus");
                                    setJoinId(String(m.match_id));
                                    handleJoinMatch(m.match_id);
                                  }}
                                  className="px-3 py-1 rounded-full text-xs border border-[var(--border)] bg-[var(--surface)]"
                                >
                                  一鍵加入
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setMode("versus");
                                  setView("versus");
                                  setSpectateId(String(m.match_id));
                                  handleSpectate(m.match_id);
                                }}
                                className="px-3 py-1 rounded-full text-xs border border-[var(--border)] bg-[var(--surface)]"
                              >
                                觀看
                              </button>
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
                  const totalVsSteps = replaySteps.length;
                  const clampedVsIndex = Math.min(replayIndex, totalVsSteps);

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
                            onClick={() => {
                              if (!replaySteps.length) return;
                              if (replayPlaying) {
                                setReplayPlaying(false);
                                return;
                              }
                              const base = replayBase ?? buildReplayBoard();
                              if (!base) {
                                setReplayError("無法重建回放棋盤");
                                setReplayPlaying(false);
                                return;
                              }
                              if (totalVsSteps > 0 && (replayIndex >= totalVsSteps || !replayBase)) {
                                const resetBoard = rebuildReplayBoard(base, replaySteps, 0);
                                setReplayBase(cloneBoardState(base));
                                setReplayBoard(resetBoard);
                                setReplayIndex(0);
                              }
                              setReplayPlaying(true);
                              setReplayError(null);
                            }}
                            disabled={replaySteps.length === 0}
                            className="px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-strong)] disabled:opacity-60"
                          >
                            {replayPlaying
                              ? "暫停"
                              : totalVsSteps === 0
                              ? "播放"
                              : replayIndex >= totalVsSteps
                              ? "重播"
                              : replayIndex > 0
                              ? "繼續"
                              : "播放"}
                          </button>
                          <label className="flex items-center gap-1 text-xs opacity-80">
                            <span>速度 {replaySpeed.toFixed(1)}x</span>
                            <input
                              type="range"
                              min="0.5"
                              max="2"
                              step="0.1"
                              value={replaySpeed}
                              onChange={(e) => setReplaySpeed(Number(e.target.value))}
                              className="accent-[var(--accent)]"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-xs opacity-80">
                            <span>進度</span>
                            <input
                              type="range"
                              min="0"
                              max={totalVsSteps}
                              step="1"
                              value={clampedVsIndex}
                              onChange={(e) => scrubVsReplay(Number(e.target.value))}
                              className="accent-[var(--accent)]"
                            />
                            <span className="tabular-nums text-[11px]">{clampedVsIndex} / {totalVsSteps}</span>
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
