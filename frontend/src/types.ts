export type DifficultyKey = "beginner" | "intermediate" | "expert" | "custom";

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
  difficulty?: string | null;
}

export interface MatchStatePlayer {
  id: number;
  name: string;
  result?: string | null;
  duration_ms?: number | null;
  steps_count: number;
  finished_at?: string | null;
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
}
