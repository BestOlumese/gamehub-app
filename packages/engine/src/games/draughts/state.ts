import type { SeatIndex } from "../../types";
import type { ClockSide } from "../clock";
import type { Variant } from "./rules";

export type Colour = "light" | "dark";

export type DraughtsEndReason =
  /** The loser has no pieces left. */
  | "no_pieces"
  /** The loser has no legal move. */
  | "blocked"
  | "resign"
  | "timeout"
  | "threefold"
  /** naija10: 25 moves each with only kings moving; english8: 40 moves each without a man move or capture. */
  | "no_progress"
  /** naija10: lone king against 3 pieces (16 moves each) or against 2 or fewer (5 moves each). */
  | "endgame"
  /** naija10: a lone king each. */
  | "kings"
  | "agreement"
  | "aborted";

/** A move as played, 1-based squares: `path` lists every landing square, `captured` the seeds taken. */
export type DraughtsMove = { from: number; path: number[]; captured: number[] };

export type DraughtsState = {
  variant: Variant;
  /** The seat playing light (the other plays dark). */
  light: SeatIndex;
  /** 0 empty, ±1 man, ±2 king (+ light), indexed by square - 1. */
  board: number[];
  turn: Colour;
  /** Every position (board as text, see `encode`), starting position first: takebacks and draw counts. */
  history: string[];
  moves: DraughtsMove[];
  /** Server time the game started (the first mover's abort window). */
  startedAt: number;
  /** Server time the side to move started thinking (null before the first move). */
  turnStartedAt: number | null;
  clock: { light: ClockSide; dark: ClockSide } | null;
  /** Huffing option: the side to move may remove one of these seeds (squares, 1-based). */
  huffable: { by: Colour; squares: number[] } | null;
  drawOffer: { by: Colour; atPly: number } | null;
  drawDeclinedAt: { light: number | null; dark: number | null };
  takeback: { by: Colour; atPly: number; expiresAt: number } | null;
  offersUsed: {
    draw: { light: number; dark: number };
    takeback: { light: number; dark: number };
  };
  result: { winner: Colour | null; reason: DraughtsEndReason } | null;
};

export type DraughtsAction =
  /** `path`: every landing square; `mt`: the client's think time in ms (lag compensation). */
  | { type: "move"; from: number; path: number[]; mt?: number }
  | { type: "huff"; square: number }
  | { type: "resign" }
  | { type: "offer_draw" }
  | { type: "accept_draw" }
  | { type: "decline_draw" }
  | { type: "request_takeback" }
  | { type: "accept_takeback" }
  | { type: "decline_takeback" }
  | { type: "abort" }
  /** Server only (timeouts): flag fall, or the abort window running out. */
  | { type: "flag" };

/** No hidden information: everyone sees the whole state, plus which colour they play. */
export type DraughtsView = DraughtsState & { you: Colour | null };
