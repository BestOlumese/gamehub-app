import { z } from "zod";
import type { SeatIndex } from "../../types";

export type Cell = 0 | 1 | null;

export type TttState = {
  board: Cell[];
  turn: SeatIndex;
  /** Who opened the current round. */
  starter: SeatIndex;
  round: number;
  score: [number, number];
  draws: number;
  roundWinner: SeatIndex | "draw" | null;
  winLine: number[] | null;
  over: boolean;
  seriesWinner: SeatIndex | "draw" | null;
};

export const tttActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("place"), cell: z.number().int().min(0).max(8) }),
  z.object({ type: z.literal("next_round") }),
]);
export type TttAction = z.infer<typeof tttActionSchema>;

/** No hidden information in Tic-tac-toe: everyone sees the whole state. */
export type TttView = TttState;

export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function winningLine(board: readonly Cell[]): readonly number[] | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v !== null && v !== undefined && v === board[b] && v === board[c]) return line;
  }
  return null;
}

export const emptyCells = (board: readonly Cell[]) =>
  board.flatMap((v, i) => (v === null ? [i] : []));
