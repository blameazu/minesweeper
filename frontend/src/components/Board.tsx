import { useEffect, useState } from "react";
import type { BoardState } from "../types";
import { CellView } from "./Cell";

interface Props {
    board: BoardState;
    onReveal: (x: number, y: number) => void;
    onFlag: (x: number, y: number) => void;
    onChord: (x: number, y: number) => void;
    maxWidth?: number;
    flagMode?: boolean;
}

export const Board = ({
    board,
    onReveal,
    onFlag,
    onChord,
    maxWidth,
    flagMode = false,
}: Props) => {
    const [viewportWidth, setViewportWidth] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth : 1280,
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const isMobile = viewportWidth < 768;

    // 水平 padding
    const horizontalPadding = isMobile ? 16 : viewportWidth < 1024 ? 120 : 220;

    // 可用寬度
    const available = maxWidth
        ? Math.min(maxWidth, viewportWidth - horizontalPadding)
        : viewportWidth - horizontalPadding;

    // cell 最小/最大尺寸
    const minCell = isMobile ? 22 : 24;
    const maxCell = 52;

    // 計算 cellSize，保證整個 Board 寬度可滾動
    const cellSize = Math.max(
        minCell,
        Math.min(maxCell, Math.floor(available / board.width))
    );

    // gap 隨 cellSize 調整
    const gapSize = Math.max(1, Math.floor(cellSize * 0.05));

    return (
        <div className="w-full overflow-x-auto">
            <div className="flex justify-center px-2">
                <div
                    className="grid bg-[var(--surface-strong)] p-2 rounded-xl shadow-lg border border-[var(--border)] select-none"
                    style={{
                        gridTemplateColumns: `repeat(${board.width}, ${cellSize}px)`,
                        gap: `${gapSize}px`,
                        ["--cell-size" as any]: `${cellSize}px`,
                        touchAction: "manipulation",
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {board.cells.map((cell) => (
                        <CellView
                            key={`${cell.x}-${cell.y}`}
                            cell={cell}
                            isSafeStart={
                                !!board.safeStart &&
                                cell.x === board.safeStart.x &&
                                cell.y === board.safeStart.y
                            }
                            onReveal={() => {
                                if (isMobile && flagMode) {
                                    onFlag(cell.x, cell.y);
                                } else {
                                    onReveal(cell.x, cell.y);
                                }
                            }}
                            onFlag={() => onFlag(cell.x, cell.y)}
                            onChord={() => onChord(cell.x, cell.y)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};
