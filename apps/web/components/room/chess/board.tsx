"use client";

import type { Side } from "@gamehub/engine/chess";
import { useRef, useState, type PointerEvent } from "react";
import { PIECE_SYMBOLS } from "./piece-symbols";

// Warm wood, light (decided with Best, Oct 2026; docs/11-design-system.md).
const LIGHT = "#F2E6D0";
const DARK = "#B88A5A";
const AMBER = "#E6A23C";
const DANGER = "#D64545";
const INK = "#1A1C20";
const PREMOVE = "#5B7083";

const FILES = "abcdefgh";
const NAMES: Record<string, string> = {
  K: "king",
  Q: "queen",
  R: "rook",
  B: "bishop",
  N: "knight",
  P: "pawn",
};

/** Square name → piece code ("wK", "bP") from a FEN. */
export function piecesOf(fen: string): Map<string, string> {
  const out = new Map<string, string>();
  (fen.split(" ")[0] ?? "").split("/").forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const side = ch === ch.toUpperCase() ? "w" : "b";
      out.set(`${FILES[file]}${8 - i}`, `${side}${ch.toUpperCase()}`);
      file++;
    }
  });
  return out;
}

export const pieceName = (code: string) =>
  `${code[0] === "w" ? "white" : "black"} ${NAMES[code[1] ?? ""] ?? ""}`;

type Props = {
  fen: string;
  /** The side shown at the bottom. */
  orientation: Side;
  lastMove: string | null;
  /** King square to ring in red. */
  check: string | null;
  selected: string | null;
  /** Where the selected piece may go. */
  targets: readonly string[];
  /** A queued premove (from, to). */
  premove: readonly [string, string] | null;
  /** May this square's piece be picked up (tapped or dragged)? */
  canPick: (square: string) => boolean;
  onTap: (square: string) => void;
  onDrop: (from: string, to: string) => void;
};

/** Our own SVG board (no GPL board libraries): squares, highlights, pieces, tap or drag. */
export function ChessBoard({
  fen,
  orientation,
  lastMove,
  check,
  selected,
  targets,
  premove,
  canPick,
  onTap,
  onDrop,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ from: string; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const pieces = piecesOf(fen);
  const flip = orientation === "b";

  const at = (square: string): [number, number] => {
    const file = FILES.indexOf(square[0] ?? "a");
    const rank = Number(square[1]) - 1;
    return flip ? [7 - file, rank] : [file, 7 - rank];
  };
  const squareAt = (e: PointerEvent): string | null => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;
    const col = Math.floor(((e.clientX - box.left) / box.width) * 8);
    const row = Math.floor(((e.clientY - box.top) / box.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const file = flip ? 7 - col : col;
    const rank = flip ? row : 7 - row;
    return `${FILES[file]}${rank + 1}`;
  };
  const pointIn = (e: PointerEvent) => {
    const box = svg.current?.getBoundingClientRect();
    return box
      ? {
          x: ((e.clientX - box.left) / box.width) * 800,
          y: ((e.clientY - box.top) / box.height) * 800,
        }
      : { x: 0, y: 0 };
  };

  function down(e: PointerEvent<SVGSVGElement>) {
    const sq = squareAt(e);
    if (!sq) return;
    if (canPick(sq)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: sq, ...pointIn(e), moved: false });
    }
    onTap(sq);
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = pointIn(e);
    const moved = drag.moved || Math.hypot(p.x - drag.x, p.y - drag.y) > 12;
    setDrag({ ...drag, ...p, moved });
  }
  function up(e: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const to = squareAt(e);
    if (drag.moved && to && to !== drag.from) onDrop(drag.from, to);
    setDrag(null);
  }

  const squares = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const name = `${FILES[f]}${r + 1}`;
      const [x, y] = at(name);
      squares.push({ name, x: x * 100, y: y * 100, light: (f + r) % 2 === 1 });
    }
  const lastFrom = lastMove?.slice(0, 2);
  const lastTo = lastMove?.slice(2, 4);

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox="0 0 800 800"
        className="block h-auto w-full touch-none select-none"
        aria-hidden="true"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
      >
        <defs dangerouslySetInnerHTML={{ __html: PIECE_SYMBOLS }} />
        {squares.map((s) => (
          <rect
            key={s.name}
            x={s.x}
            y={s.y}
            width="100"
            height="100"
            fill={s.light ? LIGHT : DARK}
          />
        ))}
        {squares.map((s) =>
          s.name === lastFrom || s.name === lastTo ? (
            <rect
              key={`l${s.name}`}
              x={s.x}
              y={s.y}
              width="100"
              height="100"
              fill={AMBER}
              opacity="0.35"
            />
          ) : s.name === selected ? (
            <rect
              key={`s${s.name}`}
              x={s.x}
              y={s.y}
              width="100"
              height="100"
              fill={AMBER}
              opacity="0.55"
            />
          ) : premove && (s.name === premove[0] || s.name === premove[1]) ? (
            <rect
              key={`p${s.name}`}
              x={s.x}
              y={s.y}
              width="100"
              height="100"
              fill={PREMOVE}
              opacity="0.4"
            />
          ) : null,
        )}
        {check
          ? (() => {
              const [x, y] = at(check);
              return (
                <circle
                  cx={x * 100 + 50}
                  cy={y * 100 + 50}
                  r="46"
                  fill="none"
                  stroke={DANGER}
                  strokeWidth="8"
                  opacity="0.85"
                />
              );
            })()
          : null}
        {/* Coordinates in the edge squares, in the other square colour. */}
        {squares.map((s) => {
          const bottom = s.y === 700;
          const left = s.x === 0;
          if (!bottom && !left) return null;
          const colour = s.light ? DARK : LIGHT;
          return (
            <g
              key={`c${s.name}`}
              fill={colour}
              fontSize="17"
              fontWeight="700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {left ? (
                <text x={s.x + 6} y={s.y + 20}>
                  {s.name[1]}
                </text>
              ) : null}
              {bottom ? (
                <text x={s.x + 94} y={s.y + 94} textAnchor="end">
                  {s.name[0]}
                </text>
              ) : null}
            </g>
          );
        })}
        {[...pieces].map(([sq, code]) => {
          if (drag?.moved && drag.from === sq) return null;
          const [x, y] = at(sq);
          return (
            <use key={sq} href={`#cp-${code}`} x={x * 100} y={y * 100} width="100" height="100" />
          );
        })}
        {targets.map((t) => {
          const [x, y] = at(t);
          return pieces.has(t) ? (
            <circle
              key={`t${t}`}
              cx={x * 100 + 50}
              cy={y * 100 + 50}
              r="45"
              fill="none"
              stroke={INK}
              strokeOpacity="0.22"
              strokeWidth="9"
            />
          ) : (
            <circle
              key={`t${t}`}
              cx={x * 100 + 50}
              cy={y * 100 + 50}
              r="15"
              fill={INK}
              fillOpacity="0.22"
            />
          );
        })}
        {drag?.moved && pieces.get(drag.from) ? (
          <use
            href={`#cp-${pieces.get(drag.from)}`}
            x={drag.x - 60}
            y={drag.y - 70}
            width="120"
            height="120"
          />
        ) : null}
      </svg>
    </div>
  );
}
