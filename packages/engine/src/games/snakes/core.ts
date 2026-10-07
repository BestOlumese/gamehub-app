// Browser-safe Snakes & Ladders logic (no zod). The full GameDefinition is in ./index.ts.
import { BOARDS, type Board, type BoardId } from "./boards";

/**
 * Playback timings (the client uses the same numbers; turn clocks wait for them):
 * die, then one hop per square, then a slide along a ladder or snake.
 */
export const ROLL_SHOW_MS = 900;
export const HOP_MS = 110;
export const SLIDE_MS = 700;
export const SETTLE_MS = 250;

export const FINISH = 100;

export const boardFor = (id: BoardId): Board => BOARDS[id];

/** Grid cell (row 0 = bottom, col 0 = left) of a square, boustrophedon: 1 bottom-left, 100 top-left. */
export function cellOf(square: number): { row: number; col: number } {
  const i = square - 1;
  const row = Math.floor(i / 10);
  const inRow = i % 10;
  return { row, col: row % 2 === 0 ? inRow : 9 - inRow };
}

export { BOARD_IDS, BOARDS, resolve, type Board, type BoardId } from "./boards";
export { snakesNaija, type SnakesRules } from "./rules";
export type { SnakesAction, SnakesState, SnakesView } from "./state";
