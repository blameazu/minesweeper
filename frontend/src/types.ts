export type DifficultyKey = "beginner" | "intermediate" | "expert";

export interface Difficulty {
  key: DifficultyKey;
  label: string;
  width: number;
  height: number;
  mines: number;
}

export interface Cell {
  x: number;
  y: number;
  isMine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
}

export interface BoardState {
  width: number;
  height: number;
  mines: number;
  cells: Cell[];
  startedAt: number | null;
  endedAt: number | null;
  status: "idle" | "playing" | "won" | "lost";
  seed: string;
  difficulty: DifficultyKey;
  safeStart?: { x: number; y: number } | null;
}

export interface LeaderboardEntry {
  id: string;
  player: string;
  difficulty: DifficultyKey;
  timeMs: number;
  createdAt: string;
}

export interface MatchBoard {
  width: number;
  height: number;
  mines: number;
  seed: string;
  safe_start?: { x: number; y: number } | null;
  safeStart?: { x: number; y: number } | null;
  difficulty?: string | null;
}

export interface MatchProgress {
  board?: BoardState;
}

export interface MatchStatePlayer {
  id: number;
  name: string;
  result?: string | null;
  duration_ms?: number | null;
  steps_count: number;
  finished_at?: string | null;
  ready: boolean;
  progress?: MatchProgress | null;
}

export interface MatchState {
  id: number;
  status: string;
  width: number;
  height: number;
  mines: number;
  seed: string;
  difficulty?: string | null;
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
  countdown_secs: number;
  safe_start?: { x: number; y: number } | null;
  host_id?: number | null;
  players: MatchStatePlayer[];
}

export interface MatchStep {
  player_name: string;
  action: string;
  x: number;
  y: number;
  elapsed_ms?: number | null;
  created_at: string;
  seq?: number | null;
}

export interface MatchSession {
  matchId: number;
  playerId: number;
  playerToken: string;
  board: MatchBoard;
  status: string;
  countdown_secs?: number;
  hostId?: number | null;
}

export interface RecentMatchPlayer {
  name: string;
  result?: string | null;
  ready?: boolean | null;
}

export interface RecentMatch {
  match_id: number;
  status: string;
  created_at: string;
  ended_at?: string | null;
  difficulty?: string | null;
  width: number;
  height: number;
  mines: number;
  players: RecentMatchPlayer[];
}

export interface User {
  id: number;
  handle: string;
  created_at: string;
}

export interface ProfileBestScore {
  difficulty: string;
  time_ms: number;
  created_at: string;
}

export interface ProfileResponse {
  handle: string;
  best_scores: ProfileBestScore[];
  match_history: MatchHistoryItem[];
}
