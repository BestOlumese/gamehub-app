// The Naija Plots board as an 11 × 11 grid: corners 1.5 units, the nine tiles on each side 1 unit
// (12 units across). Payday is bottom-right; play runs left along the bottom, up the left side,
// right along the top and down the right side.

export type Side = "bottom" | "left" | "top" | "right";
export type Cell = { row: number; col: number; side: Side | "corner" };

export function cellOf(space: number): Cell {
  if (space === 0) return { row: 10, col: 10, side: "corner" };
  if (space < 10) return { row: 10, col: 10 - space, side: "bottom" };
  if (space === 10) return { row: 10, col: 0, side: "corner" };
  if (space < 20) return { row: 20 - space, col: 0, side: "left" };
  if (space === 20) return { row: 0, col: 0, side: "corner" };
  if (space < 30) return { row: 0, col: space - 20, side: "top" };
  if (space === 30) return { row: 0, col: 10, side: "corner" };
  return { row: space - 30, col: 10, side: "right" };
}

/** CSS grid tracks for both axes. */
export const TRACKS = "1.5fr repeat(9, minmax(0, 1fr)) 1.5fr";

const UNITS = 12;
/** Start (in %) and size of grid line `i` (0–10). */
const span = (i: number) => {
  const start = i === 0 ? 0 : 1.5 + (i - 1);
  const size = i === 0 || i === 10 ? 1.5 : 1;
  return { start: (start / UNITS) * 100, size: (size / UNITS) * 100 };
};

/**
 * Where token `k` of `n` on this space sits, in % of the board: on the line between the tile and
 * the centre (so the tile's words stay readable), several in a row along it, a second row inside.
 */
export function tokenSpot(space: number, k: number, n: number): { x: number; y: number } {
  const { row, col, side } = cellOf(space);
  const r = span(row);
  const c = span(col);
  const perRow = 3;
  const step = 2.4;
  const i = k % perRow;
  const j = Math.floor(k / perRow);
  const inRow = Math.min(perRow, n - j * perRow);
  const along = (i - (inRow - 1) / 2) * step;
  const inward = j * step;
  switch (side) {
    case "bottom":
      return { x: c.start + c.size / 2 + along, y: r.start - inward };
    case "top":
      return { x: c.start + c.size / 2 + along, y: r.start + r.size + inward };
    case "left":
      return { x: c.start + c.size + inward, y: r.start + r.size / 2 + along };
    case "right":
      return { x: c.start - inward, y: r.start + r.size / 2 + along };
    default: {
      // Corners: towards the centre's corner.
      const x = col === 0 ? c.start + c.size * 0.72 : c.start + c.size * 0.28;
      const y = row === 0 ? r.start + r.size * 0.72 : r.start + r.size * 0.28;
      return { x: x + along * (col === 0 ? 1 : -1), y: y + inward * (row === 0 ? 1 : -1) };
    }
  }
}
