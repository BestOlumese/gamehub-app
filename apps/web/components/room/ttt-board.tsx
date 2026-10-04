"use client";

import type { TttState } from "@gamehub/engine";

const CELL_LABEL = [
  "top left",
  "top middle",
  "top right",
  "middle left",
  "centre",
  "middle right",
  "bottom left",
  "bottom middle",
  "bottom right",
];

function XMark() {
  return (
    <svg viewBox="0 0 100 100" className="size-[62%]" aria-hidden="true">
      <path
        d="M20 20 L80 80"
        pathLength={100}
        className="animate-draw-on"
        stroke="var(--color-ink)"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M80 20 L20 80"
        pathLength={100}
        className="animate-draw-on [animation-delay:60ms]"
        stroke="var(--color-ink)"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function OMark() {
  return (
    <svg viewBox="0 0 100 100" className="size-[62%]" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="31"
        pathLength={100}
        className="animate-draw-on"
        stroke="var(--color-brand)"
        strokeWidth="12"
        fill="none"
      />
    </svg>
  );
}

// Centres of cells on a 300-unit board, for the win line.
const centre = (i: number) => ({ x: (i % 3) * 100 + 50, y: Math.floor(i / 3) * 100 + 50 });

type Props = {
  state: TttState;
  /** Optimistic cell shown before the server confirms. */
  pendingCell: number | null;
  mySeat: number | null;
  canPlay: boolean;
  onPlay: (cell: number) => void;
  shakeKey: number;
};

export function TttBoard({ state, pendingCell, mySeat, canPlay, onPlay, shakeKey }: Props) {
  const board = state.board.slice();
  if (pendingCell !== null && mySeat !== null && board[pendingCell] === null)
    board[pendingCell] = mySeat as 0 | 1;
  const [from, , to] = state.winLine ?? [];

  return (
    <div
      key={shakeKey}
      className={`relative mx-auto aspect-square w-full max-w-[min(86vw,380px)] ${shakeKey ? "animate-shake" : ""}`}
    >
      <div
        className="grid size-full grid-cols-3 grid-rows-3 gap-2 rounded-card bg-line p-2"
        role="grid"
        aria-label="Board"
      >
        {board.map((cell, i) => {
          const free = cell === null && canPlay;
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              disabled={!free}
              onClick={() => onPlay(i)}
              aria-label={`${CELL_LABEL[i]}: ${cell === null ? "empty" : cell === 0 ? "X" : "O"}`}
              className={`flex items-center justify-center rounded-[10px] bg-board transition-colors duration-(--dur-press) ${free ? "cursor-pointer hover:bg-brand-soft active:bg-brand-soft" : "cursor-default"}`}
            >
              {cell === 0 ? <XMark /> : cell === 1 ? <OMark /> : null}
            </button>
          );
        })}
      </div>
      {from !== undefined && to !== undefined ? (
        <svg
          viewBox="0 0 300 300"
          className="pointer-events-none absolute inset-2"
          aria-hidden="true"
        >
          <line
            x1={centre(from).x}
            y1={centre(from).y}
            x2={centre(to).x}
            y2={centre(to).y}
            pathLength={100}
            className="animate-draw-on"
            stroke="var(--color-accent)"
            strokeWidth="10"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
    </div>
  );
}
