"use client";

import { BOARDS, cellOf, type BoardId } from "@gamehub/engine/snakes";
import {
  bendFor,
  centre,
  SHAPE_PATHS,
  slidePoints,
  TOKEN_COLOURS,
  TOKEN_SHAPES,
  type Pt,
} from "./geometry";

// Soft and light (decided with Best, Oct 2026): pale tinted tiles in gentle bands,
// warm wooden ladders, friendly tapered snakes. Same look as the Ludo board.
const BANDS = ["#E8F3EC", "#FCEEE1", "#E8F0FB", "#F4EAF5", "#FAF2D9"];
const SNAKE_COLOURS = ["#3E9B5F", "#E4717A", "#8E5BD9", "#1AA3A3", "#EE8A2B", "#2F6FD6"];
const RAIL = "#B9824F";
const RUNG = "#CF9D6C";

function Tiles({ plain }: { plain?: boolean }) {
  return (
    <g>
      {Array.from({ length: 100 }, (_, i) => {
        const sq = i + 1;
        const { row, col } = cellOf(sq);
        const x = col * 10;
        const y = (9 - row) * 10;
        const tinted = (row + col) % 2 === 0;
        return (
          <g key={sq}>
            <rect
              x={x + 0.35}
              y={y + 0.35}
              width="9.3"
              height="9.3"
              rx="1.6"
              fill={tinted ? BANDS[Math.floor(row / 2)] : "#FFFDF8"}
            />
            {plain ? null : (
              <text
                x={x + 1.2}
                y={y + 3.3}
                fontSize="2.5"
                fontWeight="700"
                fill="#8A8E94"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {sq}
              </text>
            )}
          </g>
        );
      })}
      {/* Finish */}
      <path
        d="M0 -1.6L0.47 -0.5L1.65 -0.45L0.75 0.3L1.05 1.45L0 0.8L-1.05 1.45L-0.75 0.3L-1.65 -0.45L-0.47 -0.5Z"
        transform={`translate(${centre(100)[0]} ${centre(100)[1] + 0.8}) scale(1.6)`}
        fill="#E6A23C"
      />
    </g>
  );
}

function Ladder({ from, to }: { from: number; to: number }) {
  const [a, b] = [centre(from), centre(to)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const [nx, ny] = [-uy * 1.9, ux * 1.9];
  const rungs = Math.max(2, Math.floor(len / 3.6));
  return (
    <g>
      <line
        x1={a[0] + nx + 0.4}
        y1={a[1] + ny + 0.6}
        x2={b[0] + nx + 0.4}
        y2={b[1] + ny + 0.6}
        stroke="#1A1C20"
        strokeOpacity="0.08"
        strokeWidth="1.1"
      />
      {Array.from({ length: rungs }, (_, i) => {
        const t = (i + 0.5) / rungs;
        const [cx, cy] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        return (
          <line
            key={i}
            x1={cx + nx}
            y1={cy + ny}
            x2={cx - nx}
            y2={cy - ny}
            stroke={RUNG}
            strokeWidth="0.75"
            strokeLinecap="round"
          />
        );
      })}
      {[1, -1].map((s) => (
        <line
          key={s}
          x1={a[0] + nx * s}
          y1={a[1] + ny * s}
          x2={b[0] + nx * s}
          y2={b[1] + ny * s}
          stroke={RAIL}
          strokeWidth="0.95"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

function Snake({ head, tail, colour }: { head: number; tail: number; colour: string }) {
  const pts = slidePoints("snake", head, tail, bendFor(head), 36);
  const n = pts.length - 1;
  const width = (i: number) => 3.1 - (2.1 * i) / n; // tapers from head to tail
  const [h, h2] = [pts[0] as Pt, pts[2] as Pt];
  const angle = (Math.atan2(h[1] - h2[1], h[0] - h2[0]) * 180) / Math.PI;
  return (
    <g>
      {pts.slice(1).map((p, i) => {
        const q = pts[i] as Pt;
        return (
          <line
            key={i}
            x1={q[0]}
            y1={q[1]}
            x2={p[0]}
            y2={p[1]}
            stroke={colour}
            strokeWidth={width(i)}
            strokeLinecap="round"
          />
        );
      })}
      {/* Belly spots */}
      {pts
        .filter((_, i) => i > 3 && i % 4 === 0 && i < n - 2)
        .map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={width(i * 4) * 0.22} fill="#fff" opacity="0.55" />
        ))}
      {/* Head with eyes */}
      <g transform={`translate(${h[0]} ${h[1]}) rotate(${angle})`}>
        <ellipse rx="2.5" ry="2.05" fill={colour} />
        <circle cx="0.9" cy="-0.85" r="0.62" fill="#fff" />
        <circle cx="0.9" cy="0.85" r="0.62" fill="#fff" />
        <circle cx="1.1" cy="-0.85" r="0.3" fill="#1A1C20" />
        <circle cx="1.1" cy="0.85" r="0.3" fill="#1A1C20" />
      </g>
    </g>
  );
}

/** Tiles, ladders and snakes for a board (no tokens). `plain` drops the numbers (small previews). */
export function SnakesBoardBase({ board, plain }: { board: BoardId; plain?: boolean }) {
  const b = BOARDS[board];
  return (
    <g>
      <rect width="100" height="100" rx="4" fill="#fff" />
      <Tiles plain={plain} />
      {Object.entries(b.ladders).map(([f, t]) => (
        <Ladder key={`l${f}`} from={Number(f)} to={t} />
      ))}
      {Object.entries(b.snakes).map(([h, t], i) => (
        <Snake
          key={`s${h}`}
          head={Number(h)}
          tail={t}
          colour={SNAKE_COLOURS[i % SNAKE_COLOURS.length] as string}
        />
      ))}
    </g>
  );
}

/** A pin marker: the player's shape as the pin head, their initial inside, a point at the bottom. */
export function Pin({
  seat,
  initial,
  x,
  y,
  scale = 1,
  active,
}: {
  seat: number;
  initial: string;
  x: number;
  y: number;
  scale?: number;
  active: boolean;
}) {
  const colour = TOKEN_COLOURS[seat % 8] as string;
  const shape = TOKEN_SHAPES[seat % 8] as keyof typeof SHAPE_PATHS;
  return (
    <g
      transform={`translate(${x} ${y + 3.6}) scale(${scale})`}
      className="transition-transform duration-(--dur-hop) ease-linear"
    >
      <ellipse cx="0" cy="0.15" rx="1.9" ry="0.6" fill="#1A1C20" opacity="0.18" />
      <g className={active ? "animate-seed-bob" : undefined}>
        <path d="M0 0 L-1.25 -3.6 L1.25 -3.6 Z" fill={colour} />
        <path
          d={SHAPE_PATHS[shape]}
          transform="translate(0 -5.4) scale(2.7)"
          fill={colour}
          stroke="#fff"
          strokeWidth="0.18"
        />
        <text
          x="0"
          y="-4.55"
          fontSize="2.5"
          fontWeight="800"
          textAnchor="middle"
          fill={seat % 8 === 2 ? "#1A1C20" : "#fff"}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {initial}
        </text>
      </g>
    </g>
  );
}
