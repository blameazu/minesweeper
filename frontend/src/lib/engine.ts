import type { BoardState, Cell, DifficultyKey } from "../types";

const difficulties: Record<DifficultyKey, { width: number; height: number; mines: number }> = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 20, height: 20, mines: 50 },
  expert: { width: 20, height: 20, mines: 99 },
  custom: { width: 9, height: 9, mines: 10 }
};

const randomSeed = () => Math.random().toString(36).slice(2, 10);

const hashSeed = (seed: string) => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
};

const rngFromSeed = (seed: string) => {
  const gen = hashSeed(seed);
  return () => gen() / 0xffffffff;
};

const index = (x: number, y: number, width: number) => y * width + x;

const neighbors = (x: number, y: number, width: number, height: number) => {
  const coords: Array<[number, number]> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        coords.push([nx, ny]);
      }
    }
  }
  return coords;
};

const floodReveal = (cells: Cell[], width: number, height: number, startX: number, startY: number) => {
  const work: Array<[number, number]> = [[startX, startY]];
  const visited = new Set<number>();

  while (work.length) {
    const [cx, cy] = work.pop()!;
    const cIdx = index(cx, cy, width);
    if (visited.has(cIdx)) continue;
    visited.add(cIdx);
    const cell = cells[cIdx];
    if (cell.flagged || cell.revealed) continue;
    cells[cIdx] = { ...cell, revealed: true };
    if (!cell.isMine && cell.adjacent === 0) {
      neighbors(cx, cy, width, height).forEach(([nx, ny]) => {
        const nIdx = index(nx, ny, width);
        if (!visited.has(nIdx)) work.push([nx, ny]);
      });
    }
  }
};

const placeMines = (width: number, height: number, mines: number, seed: string, safe?: { x: number; y: number }) => {
  const rng = rngFromSeed(seed);
  const total = width * height;
  const banned = new Set<number>();
  if (safe) {
    banned.add(index(safe.x, safe.y, width));
    neighbors(safe.x, safe.y, width, height).forEach(([nx, ny]) => banned.add(index(nx, ny, width)));
  }
  const chosen = new Set<number>();
  while (chosen.size < mines && chosen.size < total - banned.size) {
    const pick = Math.floor(rng() * total);
    if (banned.has(pick)) continue;
    chosen.add(pick);
  }
  return chosen;
};

export const createBoard = (difficulty: DifficultyKey, opts?: { width?: number; height?: number; mines?: number; seed?: string }) => {
  const defaults = difficulties[difficulty];
  const width = opts?.width ?? defaults.width;
  const height = opts?.height ?? defaults.height;
  const mines = Math.min(opts?.mines ?? defaults.mines, width * height - 1);
  const seed = opts?.seed ?? randomSeed();
  const cells: Cell[] = Array.from({ length: width * height }, (_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    return { x, y, isMine: false, adjacent: 0, revealed: false, flagged: false };
  });
  return { width, height, mines, seed, cells };
};

export const startBoard = (
  board: ReturnType<typeof createBoard>,
  firstClick: { x: number; y: number }
) => {
  const { width, height, mines, seed } = board;
  const mineSet = placeMines(width, height, mines, seed, firstClick);
  const cells = board.cells.map((cell, idx) => ({ ...cell, isMine: mineSet.has(idx) }));

  for (const cell of cells) {
    cell.adjacent = neighbors(cell.x, cell.y, width, height).reduce(
      (count, [nx, ny]) => count + (cells[index(nx, ny, width)].isMine ? 1 : 0),
      0
    );
  }

  return { ...board, cells };
};

export const reveal = (state: BoardState, x: number, y: number): BoardState => {
  if (state.status === "won" || state.status === "lost") return state;
  const idx = index(x, y, state.width);
  const target = state.cells[idx];
  if (target.revealed || target.flagged) return state;

  let startedAt = state.startedAt;
  let cells = state.cells.slice();

  // If first move, ensure board is populated with safety
  if (state.startedAt === null) {
    const newBoard = startBoard({ width: state.width, height: state.height, mines: state.mines, seed: state.seed, cells: state.cells }, { x, y });
    cells = newBoard.cells;
    startedAt = Date.now();
  }

  floodReveal(cells, state.width, state.height, x, y);

  const hitMine = cells[idx].isMine;
  const revealedCount = cells.filter((c) => c.revealed).length;
  const nonMines = state.width * state.height - state.mines;
  const won = !hitMine && revealedCount === nonMines;

  return {
    ...state,
    cells,
    startedAt,
    endedAt: won || hitMine ? Date.now() : null,
    status: hitMine ? "lost" : won ? "won" : "playing"
  };
};

export const toggleFlag = (state: BoardState, x: number, y: number): BoardState => {
  if (state.status === "won" || state.status === "lost") return state;
  const idx = index(x, y, state.width);
  const cell = state.cells[idx];
  if (cell.revealed) return state;
  const cells = state.cells.slice();
  cells[idx] = { ...cell, flagged: !cell.flagged };
  return { ...state, cells };
};

export const chordReveal = (state: BoardState, x: number, y: number): BoardState => {
  if (state.status === "won" || state.status === "lost") return state;
  const idx = index(x, y, state.width);
  const target = state.cells[idx];
  if (!target.revealed || target.adjacent === 0) return state;

  const adj = neighbors(x, y, state.width, state.height);
  const flaggedCount = adj.filter(([nx, ny]) => state.cells[index(nx, ny, state.width)].flagged).length;
  if (flaggedCount !== target.adjacent) return state;

  const cells = state.cells.slice();
  let hitMine = false;

  for (const [nx, ny] of adj) {
    const nIdx = index(nx, ny, state.width);
    const nCell = cells[nIdx];
    if (nCell.flagged || nCell.revealed) continue;
    if (nCell.isMine) {
      hitMine = true;
      cells[nIdx] = { ...nCell, revealed: true };
    } else {
      floodReveal(cells, state.width, state.height, nx, ny);
    }
  }

  const revealedCount = cells.filter((c) => c.revealed).length;
  const nonMines = state.width * state.height - state.mines;
  const won = !hitMine && revealedCount === nonMines;

  return {
    ...state,
    cells,
    startedAt: state.startedAt,
    endedAt: won || hitMine ? Date.now() : state.endedAt,
    status: hitMine ? "lost" : won ? "won" : state.status
  };
};

export const remainingMines = (state: BoardState) => {
  const flagged = state.cells.filter((c) => c.flagged).length;
  return Math.max(state.mines - flagged, 0);
};

export const createEmptyState = (
  difficulty: DifficultyKey,
  opts?: { width?: number; height?: number; mines?: number; seed?: string }
) => {
  const board = createBoard(difficulty, opts);
  const state: BoardState = {
    width: board.width,
    height: board.height,
    mines: board.mines,
    cells: board.cells,
    seed: board.seed,
    startedAt: null,
    endedAt: null,
    status: "idle",
    difficulty
  };
  return state;
};

export const difficultiesList = [
  { key: "beginner", label: "初階 (9x9, 10雷)" },
  { key: "intermediate", label: "中階 (20x20, 50雷)" },
  { key: "expert", label: "高階 (20x20, 99雷)" },
  { key: "custom", label: "自訂" }
] as const;
