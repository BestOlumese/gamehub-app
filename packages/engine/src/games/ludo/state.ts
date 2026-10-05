import type { SeatIndex } from "../../types";

export type Colour = "red" | "green" | "yellow" | "blue";

export type LudoState = {
  players: number;
  /** Seat → colour. */
  colours: Colour[];
  /** Seat → 4 seed progress values: -1 yard, 0–50 track, 51–55 home column, 56 home. */
  seeds: number[][];
  turn: SeatIndex;
  phase: "roll" | "move";
  /** The roll waiting to be used (phase "move"). */
  die: number | null;
  /** Last roll anyone made, so the die keeps showing it. */
  lastRoll: { seat: SeatIndex; value: number } | null;
  sixesInRow: number;
  /** Seeds that can move with `die` (set when the roll is made; empty otherwise). */
  movable: number[];
  finished: SeatIndex[];
  over: boolean;
  /** Places once over (ties share an inner array). */
  places: SeatIndex[][] | null;
};

export type LudoAction = { type: "roll" } | { type: "move"; seed: number };

/** Everything in Ludo is public. */
export type LudoView = LudoState;
