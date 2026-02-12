import type { DifficultyKey, LeaderboardEntry, MatchBoard, MatchSession, MatchState, MatchStep, RecentMatch, User, ProfileResponse } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const NGROK_HEADER = { "ngrok-skip-browser-warning": "true" };

const authHeaders = (token?: string) => (token ? { Authorization: `Bearer ${token}` } : {});

export const submitScore = async (params: {
  difficulty: DifficultyKey;
  timeMs: number;
  token: string;
}) => {
  const res = await fetch(`${API_BASE}/api/leaderboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER, ...authHeaders(params.token) },
    body: JSON.stringify({
      difficulty: params.difficulty,
      time_ms: params.timeMs
    })
  });
  if (!res.ok) {
    throw new Error(`提交失敗 (${res.status})`);
  }
  return res.json();
};

export const fetchLeaderboard = async (difficulty: DifficultyKey): Promise<LeaderboardEntry[]> => {
  const res = await fetch(`${API_BASE}/api/leaderboard?difficulty=${difficulty}`, {
    headers: { ...NGROK_HEADER }
  });
  if (!res.ok) {
    throw new Error(`讀取排行榜失敗 (${res.status})`);
  }
  const data = await res.json();
  return data.map((item: any) => ({
    id: String(item.id ?? ""),
    player: item.player,
    difficulty: item.difficulty,
    timeMs: item.time_ms ?? item.timeMs,
    createdAt: item.created_at ?? item.createdAt ?? ""
  }));
};

export const deleteMatch = async (matchId: number, params: { playerToken: string }) => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify({ player_token: params.playerToken })
  });
  if (!res.ok) throw new Error(`刪除對局失敗 (${res.status})`);
  return res.json();
};

export const createMatch = async (params: {
  width: number;
  height: number;
  mines: number;
  seed?: string;
  difficulty?: string;
  token: string;
}): Promise<MatchSession> => {
  const res = await fetch(`${API_BASE}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER, ...authHeaders(params.token) },
    body: JSON.stringify({
      player: "", // backend will use current user handle
      width: params.width,
      height: params.height,
      mines: params.mines,
      seed: params.seed,
      difficulty: params.difficulty
    })
  });
  if (!res.ok) throw new Error(`建立對局失敗 (${res.status})`);
  const data = await res.json();
  return {
    matchId: data.match_id,
    playerId: data.player_id,
    playerToken: data.player_token,
    board: data.board as MatchBoard,
    status: "pending",
    countdown_secs: data.countdown_secs ?? 300
  };
};

export const joinMatch = async (matchId: number, params: { token: string }): Promise<MatchSession> => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER, ...authHeaders(params.token) },
    body: JSON.stringify({ player: "" })
  });
  if (!res.ok) throw new Error(`加入對局失敗 (${res.status})`);
  const data = await res.json();
  return {
    matchId: data.match_id,
    playerId: data.player_id,
    playerToken: data.player_token,
    board: data.board as MatchBoard,
    status: "active"
  };
};

export const fetchMatchState = async (matchId: number): Promise<MatchState> => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}/state`, { headers: { ...NGROK_HEADER } });
  if (!res.ok) throw new Error(`讀取對局失敗 (${res.status})`);
  return res.json();
};

export const sendMatchStep = async (matchId: number, params: { playerToken: string; action: string; x: number; y: number; elapsed_ms?: number }) => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify({
      player_token: params.playerToken,
      action: params.action,
      x: params.x,
      y: params.y,
      elapsed_ms: params.elapsed_ms
    })
  });
  if (!res.ok) throw new Error(`送出步驟失敗 (${res.status})`);
  return res.json();
};

export const finishMatch = async (
  matchId: number,
  params: {
    playerToken: string;
    outcome: "win" | "lose" | "draw" | "forfeit";
    duration_ms?: number;
    steps_count?: number;
    progress?: Record<string, unknown>;
  }
) => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify({
      player_token: params.playerToken,
      outcome: params.outcome,
      duration_ms: params.duration_ms,
      steps_count: params.steps_count,
      progress: params.progress
    })
  });
  if (!res.ok) throw new Error(`結束對局失敗 (${res.status})`);
  return res.json();
};

export const setReady = async (matchId: number, params: { playerToken: string; ready: boolean }) => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}/ready`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify({
      player_token: params.playerToken,
      ready: params.ready
    })
  });
  if (!res.ok) throw new Error(`設定準備失敗 (${res.status})`);
  return res.json();
};

export const fetchMatchSteps = async (matchId: number): Promise<MatchStep[]> => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}/steps`, { headers: { ...NGROK_HEADER } });
  if (!res.ok) throw new Error(`讀取步驟失敗 (${res.status})`);
  return res.json();
};

export const fetchRecentMatches = async (): Promise<RecentMatch[]> => {
  const res = await fetch(`${API_BASE}/api/match/recent`, { headers: { ...NGROK_HEADER } });
  if (!res.ok) throw new Error(`讀取最近對戰失敗 (${res.status})`);
  return res.json();
};

export const fetchProfile = async (token: string): Promise<ProfileResponse> => {
  const res = await fetch(`${API_BASE}/api/profile/me`, { headers: { ...NGROK_HEADER, ...authHeaders(token) } });
  if (!res.ok) throw new Error(`讀取個人資料失敗 (${res.status})`);
  return res.json();
};

export const register = async (params: { handle: string; password: string }): Promise<string> => {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`註冊失敗 (${res.status})`);
  const data = await res.json();
  return data.access_token as string;
};

export const login = async (params: { handle: string; password: string }): Promise<string> => {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`登入失敗 (${res.status})`);
  const data = await res.json();
  return data.access_token as string;
};

export const fetchMe = async (token: string): Promise<User> => {
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: { ...NGROK_HEADER, ...authHeaders(token) } });
  if (!res.ok) throw new Error(`讀取使用者失敗 (${res.status})`);
  return res.json();
};
