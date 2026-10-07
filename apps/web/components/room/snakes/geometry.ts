import { cellOf } from "@gamehub/engine/snakes";

// The board is drawn on a 100-unit square: a 10×10 grid of 10-unit cells,
// square 1 bottom-left, rows snaking up to 100 top-left.

export type Pt = readonly [number, number];

export const centre = (square: number): Pt => {
  if (square <= 0) return [-6, 95]; // off the board: just left of square 1
  const { row, col } = cellOf(square);
  return [col * 10 + 5, (9 - row) * 10 + 5];
};

/** Up to 8 players: colour + shape, so tokens are readable without colour. */
export const TOKEN_COLOURS = [
  "#D9473A",
  "#1F9D5B",
  "#E8B021",
  "#2F6FD6",
  "#8E5BD9",
  "#E07A2E",
  "#1AA3A3",
  "#C2417E",
] as const;
export const TOKEN_SHAPES = [
  "circle",
  "triangle",
  "square",
  "diamond",
  "star",
  "hexagon",
  "cross",
  "pentagon",
] as const;
export type TokenShape = (typeof TOKEN_SHAPES)[number];

/** Shape paths in a unit box around (0, 0). */
export const SHAPE_PATHS: Record<TokenShape, string> = {
  circle: "M0 -1a1 1 0 1 1 0 2a1 1 0 1 1 0 -2Z",
  triangle: "M0 -1.05L1 0.75H-1Z",
  square: "M-0.82 -0.82h1.64v1.64h-1.64Z",
  diamond: "M0 -1.1L1 0L0 1.1L-1 0Z",
  star: "M0 -1.05L0.3 -0.32L1.05 -0.3L0.47 0.18L0.66 0.95L0 0.52L-0.66 0.95L-0.47 0.18L-1.05 -0.3L-0.3 -0.32Z",
  hexagon: "M0 -1L0.87 -0.5V0.5L0 1L-0.87 0.5V-0.5Z",
  cross: "M-0.32 -1h0.64v0.68h0.68v0.64h-0.68v0.68h-0.64v-0.68h-0.68v-0.64h0.68Z",
  pentagon: "M0 -1L0.95 -0.31L0.59 0.81H-0.59L-0.95 -0.31Z",
};

/** Cubic Bézier control points for a snake from head to tail, bending one way or the other. */
export function snakeCurve(head: number, tail: number, bend: 1 | -1): [Pt, Pt, Pt, Pt] {
  const a = centre(head);
  const b = centre(tail);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(16, len * 0.32) * bend;
  const nx = (-dy / len) * k;
  const ny = (dx / len) * k;
  return [
    a,
    [a[0] + dx / 3 + nx, a[1] + dy / 3 + ny],
    [a[0] + (2 * dx) / 3 - nx, a[1] + (2 * dy) / 3 - ny],
    b,
  ];
}

export function bezier([p0, p1, p2, p3]: readonly [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
  return [
    w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0],
    w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1],
  ];
}

/** Points along a snake (head → tail) or a ladder (bottom → top), for drawing and sliding. */
export function slidePoints(
  kind: "snake" | "ladder",
  from: number,
  to: number,
  bend: 1 | -1,
  n = 14,
): Pt[] {
  if (kind === "ladder") {
    const a = centre(from);
    const b = centre(to);
    return Array.from(
      { length: n + 1 },
      (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt,
    );
  }
  const c = snakeCurve(from, to, bend);
  return Array.from({ length: n + 1 }, (_, i) => bezier(c, i / n));
}

/** Snakes bend alternately so neighbours don't look the same. */
export const bendFor = (head: number): 1 | -1 => (head % 2 ? 1 : -1);
