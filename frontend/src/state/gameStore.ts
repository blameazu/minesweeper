import { create } from "zustand";
import type { BoardState, DifficultyKey } from "../types";
import { createEmptyState, reveal, toggleFlag, chordReveal } from "../lib/engine";

interface GameStore {
  board: BoardState;
  setDifficulty: (difficulty: DifficultyKey, opts?: { width?: number; height?: number; mines?: number; seed?: string; safeStart?: { x: number; y: number } | null }) => void;
  startFresh: (opts?: { width?: number; height?: number; mines?: number; seed?: string; safeStart?: { x: number; y: number } | null }) => void;
  revealCell: (x: number, y: number) => void;
  toggleFlag: (x: number, y: number) => void;
  chordCell: (x: number, y: number) => void;
}

const initialDifficulty: DifficultyKey = "beginner";

export const useGameStore = create<GameStore>((set, get) => ({
  board: createEmptyState(initialDifficulty),
  setDifficulty: (difficulty, opts) => {
    set({ board: createEmptyState(difficulty, opts) });
  },
  startFresh: (opts) => {
    const { board } = get();
    set({ board: createEmptyState(board.difficulty, opts) });
  },
  revealCell: (x, y) => set((state) => ({ board: reveal(state.board, x, y) })),
  toggleFlag: (x, y) => set((state) => ({ board: toggleFlag(state.board, x, y) })),
  chordCell: (x, y) => set((state) => ({ board: chordReveal(state.board, x, y) }))
}));
