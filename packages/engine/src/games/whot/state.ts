import type { SeatIndex } from "../../types";
import type { Shape } from "./cards";

export type PendingPick = { amount: number; kind: 2 | 5 };

export type WhotState = {
  players: number;
  hands: string[][];
  /** Draw pile; top = end. */
  market: string[];
  /** Discards; top = end (the call card). */
  pile: string[];
  /** Shape requested by the last Whot, if any. */
  callShape: Shape | null;
  turn: SeatIndex;
  pendingPick: PendingPick | null;
  lastCardDeclared: boolean[];
  /** A seat that reached one card without declaring; the next player's action costs them. */
  lastCardDue: SeatIndex | null;
  /** Seats that have emptied their hand, in order. */
  finished: SeatIndex[];
  over: boolean;
  /** Places once over (ties share an inner array). */
  places: SeatIndex[][] | null;
  /** Public memory for bots: who went to market when a shape was wanted. */
  misses: Array<{ seat: SeatIndex; shape: Shape }>;
  /** Times the pile has been reshuffled into the market (capped so every game ends). */
  reshuffles: number;
};

export type WhotAction =
  | { type: "play"; card: string; requestShape?: Shape; checkUp?: boolean }
  | { type: "market" }
  | { type: "declare_last_card" };

/** What one seat may see. Spectators get `you: null`; nobody ever sees another hand. */
export type WhotView = {
  players: number;
  you: { seat: SeatIndex; hand: string[] } | null;
  counts: number[];
  top: string;
  /** The last few discards under the call card, for the fanned pile. */
  pileTop: string[];
  callShape: Shape | null;
  marketCount: number;
  turn: SeatIndex;
  pendingPick: PendingPick | null;
  lastCardDeclared: boolean[];
  lastCardDue: SeatIndex | null;
  finished: SeatIndex[];
  over: boolean;
  places: SeatIndex[][] | null;
  /** Hand totals, revealed only when the game ends by counting. */
  totals: number[] | null;
};
