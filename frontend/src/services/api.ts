import type { DifficultyKey, LeaderboardEntry, MatchBoard, MatchSession, MatchState, MatchStep } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const NGROK_HEADER = { "ngrok-skip-browser-warning": "true" };

export const submitScore = async (params: {
  player: string;
  difficulty: DifficultyKey;
  timeMs: number;
}) => {
  const res = await fetch(`${API_BASE}/api/leaderboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify({
      player: params.player,
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

export const createMatch = async (params: {
  player: string;
  width: number;
  height: number;
  mines: number;
  seed?: string;
  difficulty?: string;
}): Promise<MatchSession> => {
  const res = await fetch(`${API_BASE}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`建立對局失敗 (${res.status})`);
  const data = await res.json();
  return {
    matchId: data.match_id,
    playerId: data.player_id,
    playerToken: data.player_token,
    board: data.board as MatchBoard,
    status: "pending"
  };
};

export const joinMatch = async (matchId: number, params: { player: string }): Promise<MatchSession> => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify(params)
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

export const finishMatch = async (matchId: number, params: { playerToken: string; outcome: "win" | "lose" | "draw" | "forfeit"; duration_ms?: number; steps_count?: number }) => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify({
      player_token: params.playerToken,
      outcome: params.outcome,
      duration_ms: params.duration_ms,
      steps_count: params.steps_count
    })
  });
  if (!res.ok) throw new Error(`結束對局失敗 (${res.status})`);
  return res.json();
};

export const fetchMatchSteps = async (matchId: number): Promise<MatchStep[]> => {
  const res = await fetch(`${API_BASE}/api/match/${matchId}/steps`, { headers: { ...NGROK_HEADER } });
  if (!res.ok) throw new Error(`讀取步驟失敗 (${res.status})`);
  return res.json();
};
