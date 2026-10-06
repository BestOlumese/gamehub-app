import { HOME, LAST_TRACK, square, START, type Colour } from "@gamehub/engine/ludo";

// Board drawn on a 150-unit square: a 15×15 grid of 10-unit cells, red yard top-left,
// green top-right, yellow bottom-right, blue bottom-left; play goes clockwise.

type Cell = readonly [row: number, col: number];

/** Track squares 0–51 as grid cells, starting at red's start square. */
export const TRACK_CELLS: readonly Cell[] = [
  ...[1, 2, 3, 4, 5].map((c) => [6, c] as const),
  ...[5, 4, 3, 2, 1, 0].map((r) => [r, 6] as const),
  [0, 7],
  ...[0, 1, 2, 3, 4, 5].map((r) => [r, 8] as const),
  ...[9, 10, 11, 12, 13, 14].map((c) => [6, c] as const),
  [7, 14],
  ...[14, 13, 12, 11, 10, 9].map((c) => [8, c] as const),
  ...[9, 10, 11, 12, 13, 14].map((r) => [r, 8] as const),
  [14, 7],
  ...[14, 13, 12, 11, 10, 9].map((r) => [r, 6] as const),
  ...[5, 4, 3, 2, 1, 0].map((c) => [8, c] as const),
  [7, 0],
  [6, 0],
];

/** Home column cells (progress 51–55) per colour. */
export const COLUMN: Record<Colour, readonly Cell[]> = {
  red: [1, 2, 3, 4, 5].map((c) => [7, c] as const),
  green: [1, 2, 3, 4, 5].map((r) => [r, 7] as const),
  yellow: [13, 12, 11, 10, 9].map((c) => [7, c] as const),
  blue: [13, 12, 11, 10, 9].map((r) => [r, 7] as const),
};

/** Where finished seeds rest: inside their colour's centre triangle. */
const HOME_SPOT: Record<Colour, readonly [number, number]> = {
  red: [65, 75],
  green: [75, 65],
  yellow: [85, 75],
  blue: [75, 85],
};

export const YARD_ORIGIN: Record<Colour, readonly [number, number]> = {
  red: [0, 0],
  green: [90, 0],
  yellow: [90, 90],
  blue: [0, 90],
};
export const YARD_SPOTS = [
  [22, 22],
  [38, 22],
  [22, 38],
  [38, 38],
] as const;

export const COLOUR_HEX: Record<Colour, string> = {
  red: "#D9473A",
  green: "#1F9D5B",
  yellow: "#E8B021",
  blue: "#2F6FD6",
};

const centre = ([r, c]: Cell): [number, number] => [c * 10 + 5, r * 10 + 5];

/** Board coordinates (x, y) of a seed. */
export function seedXY(colour: Colour, p: number, seed: number): [number, number] {
  if (p === -1) {
    const [ox, oy] = YARD_ORIGIN[colour];
    const [sx, sy] = YARD_SPOTS[seed] ?? YARD_SPOTS[0];
    return [ox + sx, oy + sy];
  }
  if (p === HOME) return [...HOME_SPOT[colour]];
  if (p > LAST_TRACK) return centre(COLUMN[colour][p - LAST_TRACK - 1] ?? [7, 7]);
  return centre(TRACK_CELLS[square(colour, p) ?? 0] ?? [7, 7]);
}

export const trackCell = (sq: number) => centre(TRACK_CELLS[sq] ?? [7, 7]);
export const startCell = (colour: Colour) => centre(TRACK_CELLS[START[colour]] ?? [7, 7]);

/** Quarter turns (anticlockwise) that bring a colour's yard to the bottom-left. */
export const TURNS: Record<Colour, number> = { red: 1, green: 2, yellow: 3, blue: 0 };

/** Screen corner (0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left) of a colour's yard. */
export function cornerOf(colour: Colour, turns: number) {
  const base = { red: 0, green: 1, yellow: 2, blue: 3 }[colour];
  return (base + 3 * turns) % 4;
}

/** A colour mixed with white: amount 1 is the colour, 0 is white. */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix) as [number, number, number];
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
