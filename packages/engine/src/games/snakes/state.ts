import type { SeatIndex } from "../../types";
import type { BoardId } from "./boards";

export type SnakesState = {
  players: number;
  board: BoardId;
  /** Square per seat: 0 = not on the board yet, 1–100. */
  pos: number[];
  turn: SeatIndex;
  sixesInRow: number;
  /** Last roll anyone made, so the die keeps showing it. */
  lastRoll: { seat: SeatIndex; value: number } | null;
  /** Seats that reached 100, in order. */
  finished: SeatIndex[];
  over: boolean;
  /** Places once over (ties share an inner array). */
  places: SeatIndex[][] | null;
};

export type SnakesAction = { type: "roll" };

/** Everything is public. */
export type SnakesView = SnakesState;
