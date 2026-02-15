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
  hasReplay?: boolean;
}

export interface ReplayStep {
  action: "reveal" | "flag" | "chord";
  x: number;
  y: number;
  elapsed_ms?: number | null;
}

export interface LeaderboardReplay {
  player: string;
  difficulty: DifficultyKey;
  entry_id: number;
  board: {
    width: number;
    height: number;
    mines: number;
    seed: string;
    difficulty?: string | null;
    safe_start?: { x: number; y: number } | null;
  };
  steps: ReplayStep[];
  time_ms: number;
  duration_ms?: number | null;
  steps_count: number;
  created_at: string;
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
  rank?: number | null;
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

export interface ActiveMatchResponse {
  active: boolean;
  match_id?: number;
  player_id?: number;
  player_token?: string;
  status?: string;
  countdown_secs?: number;
  started_at?: string | null;
  board?: MatchBoard;
  host_id?: number | null;
}

export interface RankEntry {
  handle: string;
  score: number;
}

export interface RankBoard {
  top: RankEntry[];
  me?: RankEntry | null;
}

export interface RecentMatchPlayer {
  id: number;
  name: string;
  result?: string | null;
  ready?: boolean | null;
  is_host?: boolean;
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
  host_id?: number | null;
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
  entry_id: number;
  has_replay: boolean;
}

export interface ProfileResponse {
  handle: string;
  best_scores: ProfileBestScore[];
  match_history: MatchHistoryItem[];
  rank_counts: {
    first: number;
    second: number;
    third: number;
    last: number;
  };
}

export interface BlogPostItem {
  id: number;
  title: string;
  content: string;
  author: string;
  created_at: string;
  updated_at: string;
  upvotes: number;
  downvotes: number;
  score: number;
  comment_count: number;
  my_vote?: number | null;
}

export interface BlogComment {
  id: number;
  post_id: number;
  user_id: number;
  author: string;
  content: string;
  created_at: string;
}

export interface BlogPostDetail extends BlogPostItem {
  comments: BlogComment[];
}
