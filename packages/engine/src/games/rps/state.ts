import type { SeatIndex } from "../../types";

export const THROWS = ["rock", "paper", "scissors"] as const;
export type Throw = (typeof THROWS)[number];

/** What beats what: BEATS[x] is the throw x defeats. */
export const BEATS: Record<Throw, Throw> = { rock: "scissors", paper: "rock", scissors: "paper" };
/** The throw that beats x. */
export const COUNTER: Record<Throw, Throw> = { rock: "paper", paper: "scissors", scissors: "rock" };

export type Reveal = {
  /** 1-based throw number in this match. */
  n: number;
  a: Throw;
  b: Throw;
  /** Throw winner, or "tie". */
  result: SeatIndex | "tie";
  /** True when a run of ties was settled by the server's coin. */
  coin: boolean;
};

export type Match = {
  /** null = bye */
  a: SeatIndex | null;
  b: SeatIndex | null;
  score: [number, number];
  /** Ties in a row on the current throw. */
  ties: number;
  /** Pending, hidden picks. Never sent to anyone but their owner. */
  picks: Partial<Record<SeatIndex, Throw>>;
  /** Revealed throws, oldest first. Public. */
  history: Reveal[];
  winner: SeatIndex | null;
};

export type RpsState = {
  players: number;
  /** Bracket rounds; a duel is a single round with a single match. */
  rounds: Match[][];
  round: number;
  eliminated: Array<{ seat: SeatIndex; round: number }>;
  over: boolean;
  champion: SeatIndex | null;
};

export type RpsAction = { type: "throw"; pick: Throw };

/** A match as one viewer sees it: other players' pending picks become a "thrown" flag. */
export type MatchView = Omit<Match, "picks"> & {
  /** Seats in this match that have thrown and are waiting for the reveal. */
  thrown: SeatIndex[];
  /** The viewer's own pending pick, if they're in this match. */
  mine?: Throw;
};

export type RpsView = Omit<RpsState, "rounds"> & { rounds: MatchView[][] };

export const isLive = (m: Match) => m.winner === null && m.a !== null && m.b !== null;

export function matchOf(
  rounds: readonly Match[][],
  round: number,
  seat: SeatIndex,
): Match | undefined {
  return rounds[round]?.find((m) => m.a === seat || m.b === seat);
}
