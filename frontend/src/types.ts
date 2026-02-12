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
