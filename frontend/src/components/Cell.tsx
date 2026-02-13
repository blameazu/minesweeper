import type { Cell } from "../types";
import clsx from "clsx";

interface Props {
  cell: Cell;
  isSafeStart?: boolean;
  onReveal: () => void;
  onFlag: () => void;
  onChord: () => void;
}

const numberColors: Record<number, string> = {
  1: "text-blue-600",
  2: "text-green-600",
  3: "text-red-600",
  4: "text-indigo-700",
  5: "text-amber-700",
  6: "text-teal-600",
  7: "text-gray-800",
  8: "text-gray-500"
};

export const CellView = ({ cell, isSafeStart, onReveal, onFlag, onChord }: Props) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (cell.revealed && cell.adjacent > 0) {
      onChord();
    } else {
      onReveal();
    }
  };

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault();
    onFlag();
  };

  let content: React.ReactNode = null;
  if (cell.revealed) {
    if (cell.isMine) content = "💣";
    else if (cell.adjacent > 0) content = cell.adjacent;
  } else if (cell.flagged) {
    content = "🚩";
  }

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContext}
      className={clsx(
        "cell relative flex items-center justify-center border text-lg font-semibold rounded shadow-sm",
        cell.revealed ? "cell-revealed" : "cell-hidden",
        cell.revealed && cell.isMine && "cell-mine",
        cell.revealed && !cell.isMine && numberColors[cell.adjacent]
      )}
    >
      {isSafeStart && !cell.revealed && (
        <span className="absolute inset-0 pointer-events-none bg-red-500/70 text-white text-xs font-bold flex items-center justify-center rounded-sm">
          S
        </span>
      )}
      {content}
    </button>
  );
};
