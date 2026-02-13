import type { BoardState } from "../types";
import { CellView } from "./Cell";

interface Props {
  board: BoardState;
  onReveal: (x: number, y: number) => void;
  onFlag: (x: number, y: number) => void;
  onChord: (x: number, y: number) => void;
  maxWidth?: number;
}

export const Board = ({ board, onReveal, onFlag, onChord, maxWidth }: Props) => {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const baseline = Math.max(500, Math.min(1200, viewportWidth - 220));
  const available = maxWidth ? Math.min(maxWidth, baseline) : baseline;
  const cellSize = Math.max(30, Math.min(52, Math.floor(available / board.width)));
  return (
    <div
      className="grid gap-1 bg-[var(--surface-strong)] p-2 rounded-xl shadow-lg border border-[var(--border)]"
      style={{ gridTemplateColumns: `repeat(${board.width}, ${cellSize}px)`, ['--cell-size' as any]: `${cellSize}px` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {board.cells.map((cell) => (
        <CellView
          key={`${cell.x}-${cell.y}`}
          cell={cell}
          isSafeStart={!!board.safeStart && cell.x === board.safeStart.x && cell.y === board.safeStart.y}
          onReveal={() => onReveal(cell.x, cell.y)}
          onFlag={() => onFlag(cell.x, cell.y)}
          onChord={() => onChord(cell.x, cell.y)}
        />
      ))}
    </div>
  );
};
