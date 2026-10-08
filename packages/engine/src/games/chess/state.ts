import type { SeatIndex } from "../../types";

export type Side = "w" | "b";

/** Lichess-style lag compensation (scalachess LagTracker): forgive up to `quota` ms a move. */
export type LagTracker = { gain: number; quota: number; max: number };
export type ClockSide = { remainingMs: number; lag: LagTracker };

export type ChessEndReason =
  | "checkmate"
  | "resign"
  | "timeout"
  | "timeout_vs_insufficient"
  | "stalemate"
  | "insufficient"
  | "threefold"
  | "fivefold"
  | "fifty"
  | "seventyfive"
  | "agreement"
  | "aborted";

export type ChessState = {
  /** The seat playing White (the room's "who goes first"). */
  white: SeatIndex;
  fen: string;
  /** Position after every ply, starting position first: takebacks and repetition counts. */
  history: string[];
  /** UCI ("e2e4", "e7e8q") and SAN, one per ply. */
  moves: string[];
  san: string[];
  /** Server time the game started (White's abort window). */
  startedAt: number;
  /** Server time the side to move started thinking (null before White's first move). */
  turnStartedAt: number | null;
  clock: { w: ClockSide; b: ClockSide } | null;
  drawOffer: { by: Side; atPly: number } | null;
  /** Ply of each side's last declined draw offer (10 moves between offers after a decline). */
  drawDeclinedAt: { w: number | null; b: number | null };
  takeback: { by: Side; atPly: number; expiresAt: number } | null;
  offersUsed: { draw: { w: number; b: number }; takeback: { w: number; b: number } };
  result: { winner: Side | null; reason: ChessEndReason } | null;
};

export type ChessAction =
  /** `mt`: the client's think time in ms (0 = a premove); only ever reduces lag charged. */
  | { type: "move"; uci: string; mt?: number }
  | { type: "resign" }
  | { type: "offer_draw" }
  | { type: "accept_draw" }
  | { type: "decline_draw" }
  | { type: "claim_draw" }
  | { type: "request_takeback" }
  | { type: "accept_takeback" }
  | { type: "decline_takeback" }
  | { type: "abort" }
  /** Server only (timeouts): flag fall, or the abort window running out. Never accepted from clients. */
  | { type: "flag" };

/** Chess has no hidden information: everyone sees the whole state, plus which side they play. */
export type ChessView = ChessState & { you: Side | null };
