"use client";

import { boardSize, squareAt, type DraughtsRules, type Variant } from "@gamehub/engine/draughts";
import { useRef, useState, type PointerEvent } from "react";

// Green and cream (decided with Best, Oct 2026; docs/11-design-system.md).
const LIGHT = "#EEEED2";
const DARK = "#769656";
const AMBER = "#E6A23C";
const DANGER = "#D64545";
const INK = "#1A1C20";

/** A crimped bottle cap (no brand), drawn once per colour; kings stack two and add a crown. */
function capSymbol(id: string, body: string, edge: string) {
  const teeth = 21;
  const points = Array.from({ length: teeth * 2 }, (_, i) => {
    const a = (Math.PI * i) / teeth;
    const r = i % 2 === 0 ? 43 : 37.5;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<symbol id="${id}" viewBox="0 0 100 100"><ellipse cx="50" cy="57" rx="41" ry="38" fill="#000" opacity=".28"/><polygon points="${points}" fill="${edge}" stroke="#1A1C20" stroke-opacity=".35" stroke-width="1.5"/><circle cx="50" cy="50" r="33" fill="${body}"/><circle cx="50" cy="50" r="25" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/><path d="M27 42a25 25 0 0 1 18-17" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/></symbol>`;
}
const SYMBOLS =
  capSymbol("dc-l", "#D33A2C", "#A52A1F") +
  capSymbol("dc-d", "#1F7A3D", "#145A2B") +
  `<symbol id="dc-k" viewBox="0 0 100 100"><path d="M30 56 34 30 44 44 50 26 56 44 66 30 70 56Z" fill="#F2C94C" stroke="#6B4E00" stroke-width="3" stroke-linejoin="round"/></symbol>`;

export const seedName = (v: number) =>
  `${v > 0 ? "red" : "green"} ${Math.abs(v) === 2 ? "king" : "seed"}`;

/** One seed: a cap, or for a king two caps stacked with a crown on top. */
function Seed({ v, x, y, cell }: { v: number; x: number; y: number; cell: number }) {
  const id = v > 0 ? "#dc-l" : "#dc-d";
  if (Math.abs(v) === 1) return <use href={id} x={x} y={y} width={cell} height={cell} />;
  const lift = cell * 0.07;
  return (
    <g>
      <use href={id} x={x} y={y + lift} width={cell} height={cell} />
      <use href={id} x={x} y={y - lift} width={cell} height={cell} />
      <use href="#dc-k" x={x} y={y - lift} width={cell} height={cell} />
    </g>
  );
}

type Props = {
  variant: Variant;
  orientation: DraughtsRules["orientation"];
  /** Turn the board round (you play green). */
  flip: boolean;
  board: readonly number[];
  /** Squares of the last move (start, landings) to tint. */
  lastSquares: readonly number[];
  /** Seeds just captured, shown fading out together (Turkish strike); `key` restarts the fade. */
  fading: { key: number; seeds: ReadonlyArray<{ sq: number; v: number }> } | null;
  selected: number | null;
  /** Where the selected seed may end up (or the next hop when choosing a route). */
  targets: readonly number[];
  /** Hops tapped so far while choosing between routes. */
  route: readonly number[];
  /** Seeds that can capture now (captures are compulsory). */
  mustTake: readonly number[];
  /** Seeds you may huff. */
  huffable: readonly number[];
  canPick: (sq: number) => boolean;
  onTap: (sq: number) => void;
  onDrop: (from: number, to: number) => void;
};

/** Our own SVG draughts board: green and cream squares, bottle-cap seeds, tap or drag. */
export function DraughtsBoard({
  variant,
  orientation,
  flip,
  board,
  lastSquares,
  fading,
  selected,
  targets,
  route,
  mustTake,
  huffable,
  canPick,
  onTap,
  onDrop,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const size = boardSize(variant);
  const cell = 100;
  const span = size * cell;

  // Square number → drawn position, and back (for taps and drops).
  const pos = (sq: number) => {
    const { col, row } = squareAt(variant, orientation, sq, flip);
    return { x: col * cell, y: row * cell };
  };
  const byCell = new Map<number, number>();
  for (let sq = 1; sq <= board.length; sq++) {
    const { x, y } = pos(sq);
    byCell.set((y / cell) * size + x / cell, sq);
  }
  const pointIn = (e: PointerEvent) => {
    const box = svg.current?.getBoundingClientRect();
    return box
      ? {
          x: ((e.clientX - box.left) / box.width) * span,
          y: ((e.clientY - box.top) / box.height) * span,
        }
      : { x: -1, y: -1 };
  };
  const squareFrom = (e: PointerEvent): number | null => {
    const p = pointIn(e);
    const col = Math.floor(p.x / cell);
    const row = Math.floor(p.y / cell);
    if (col < 0 || col >= size || row < 0 || row >= size) return null;
    return byCell.get(row * size + col) ?? null;
  };

  function down(e: PointerEvent<SVGSVGElement>) {
    const sq = squareFrom(e);
    if (sq === null) return;
    if (canPick(sq)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: sq, ...pointIn(e), moved: false });
    }
    onTap(sq);
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = pointIn(e);
    const moved = drag.moved || Math.hypot(p.x - drag.x, p.y - drag.y) > 14;
    setDrag({ ...drag, ...p, moved });
  }
  function up(e: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const to = squareFrom(e);
    if (drag.moved && to !== null && to !== drag.from) onDrop(drag.from, to);
    setDrag(null);
  }

  const dark = Array.from({ length: board.length }, (_, i) => ({ sq: i + 1, ...pos(i + 1) }));
  const tint = (sq: number, colour: string, opacity: number, key: string) => {
    const { x, y } = pos(sq);
    return (
      <rect key={key} x={x} y={y} width={cell} height={cell} fill={colour} opacity={opacity} />
    );
  };
  const ring = (sq: number, colour: string, key: string, dashed = false) => {
    const { x, y } = pos(sq);
    return (
      <circle
        key={key}
        cx={x + cell / 2}
        cy={y + cell / 2}
        r={cell * 0.46}
        fill="none"
        stroke={colour}
        strokeWidth={cell * 0.06}
        strokeDasharray={dashed ? `${cell * 0.12} ${cell * 0.08}` : undefined}
      />
    );
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${span} ${span}`}
      className="block h-auto w-full touch-none select-none"
      aria-hidden="true"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
    >
      <defs dangerouslySetInnerHTML={{ __html: SYMBOLS }} />
      <rect width={span} height={span} fill={LIGHT} />
      {dark.map((d) => (
        <rect key={d.sq} x={d.x} y={d.y} width={cell} height={cell} fill={DARK} />
      ))}
      {lastSquares.map((sq, i) => tint(sq, AMBER, 0.38, `l${i}${sq}`))}
      {route.map((sq, i) => tint(sq, AMBER, 0.55, `r${i}${sq}`))}
      {selected !== null ? tint(selected, AMBER, 0.6, "sel") : null}
      {mustTake.map((sq) => ring(sq, AMBER, `m${sq}`))}
      {huffable.map((sq) => ring(sq, DANGER, `h${sq}`, true))}
      {board.map((v, i) => {
        const sq = i + 1;
        if (!v || (drag?.moved && drag.from === sq)) return null;
        const { x, y } = pos(sq);
        return <Seed key={sq} v={v} x={x} y={y} cell={cell} />;
      })}
      {fading?.seeds.map(({ sq, v }) => {
        const { x, y } = pos(sq);
        return (
          <g key={`f${fading.key}-${sq}`} opacity="0">
            <animate attributeName="opacity" from="1" to="0" dur="0.5s" fill="freeze" />
            <Seed v={v} x={x} y={y} cell={cell} />
          </g>
        );
      })}
      {/* Square numbers, as in the move list: in the corner, clear of the caps. */}
      {dark.map((d) => (
        <text
          key={`n${d.sq}`}
          x={d.x + 4}
          y={d.y + 16}
          fontSize="15"
          fontWeight="700"
          fill={LIGHT}
          opacity="0.75"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {d.sq}
        </text>
      ))}
      {targets.map((sq) => {
        const { x, y } = pos(sq);
        return (
          <circle
            key={`t${sq}`}
            cx={x + cell / 2}
            cy={y + cell / 2}
            r={cell * 0.16}
            fill={INK}
            fillOpacity="0.3"
          />
        );
      })}
      {drag?.moved && board[drag.from - 1] ? (
        <Seed v={board[drag.from - 1] as number} x={drag.x - 60} y={drag.y - 70} cell={120} />
      ) : null}
    </svg>
  );
}
