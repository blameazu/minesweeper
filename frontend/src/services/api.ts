import type { DifficultyKey, LeaderboardEntry } from "../types";

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
