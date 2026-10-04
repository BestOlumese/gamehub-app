import type { z } from "zod";

export const GAME_SLUGS = ["whot", "ludo", "snakes", "tictactoe", "rps"] as const;
export type GameSlug = (typeof GAME_SLUGS)[number];

export type SeatIndex = number;

export type GameEvent = { type: string } & Record<string, unknown>;

export type Result<T, E> = { ok: true; state: T; events: GameEvent[] } | { ok: false; error: E };

export interface Rng {
  /** Uniform integer in [0, maxExclusive), rejection sampling (no modulo bias). */
  int(maxExclusive: number): number;
  /** Fisher–Yates; returns a new array. */
  shuffle<T>(arr: readonly T[]): T[];
  /** Draws consumed so far (persisted so the stream can be replayed). */
  counter(): number;
}

export interface Ctx<R> {
  rng: Rng;
  rules: R;
  /** Injected by the caller, for logging only. */
  now: number;
}

export interface RuleConfigBase {
  /** 10–120, default 30. */
  turnSeconds: number;
}

export type RuleErrorCode =
  | "NOT_YOUR_TURN"
  | "ILLEGAL_MOVE"
  | "GAME_OVER"
  | "BAD_ACTION"
  | "MUST_ANSWER_PENALTY"
  | "MUST_PLAY_REQUESTED_SHAPE"
  | "NO_SUCH_CARD"
  | "NEED_SIX"
  | "OVERSHOOT"
  | "ALREADY_THREW";

export type BotLevel = "easy" | "medium" | "hard";

export interface GameDefinition<S, A, V, R extends RuleConfigBase> {
  slug: GameSlug;
  minPlayers: number;
  maxPlayers: number;
  presets: { naija: R } & Record<string, R>;
  ruleSchema: z.ZodType<R>;
  /** Validates actions arriving from clients before `apply` sees them. */
  actionSchema: z.ZodType<A>;
  setup(players: number, ctx: Ctx<R>): S;
  currentSeats(s: S): SeatIndex[];
  legalActions(s: S, seat: SeatIndex, rules: R): A[];
  apply(s: S, input: { seat: SeatIndex; action: A }, ctx: Ctx<R>): Result<S, RuleErrorCode>;
  /** What happens when a turn timer runs out (randomness injected, like everywhere else). */
  timeoutAction(s: S, seat: SeatIndex, rules: R, rng: Rng): A;
  /**
   * A move the server makes on its own after a pause (e.g. "next round" 2.5 s
   * after a round ends). The room applies it as `seat` once `afterMs` passes.
   */
  autoAdvance(s: S, rules: R): { seat: SeatIndex; action: A; afterMs: number } | null;
  /** MUST strip hidden info. The only engine output that reaches clients. */
  view(s: S, viewer: SeatIndex | "spectator"): V;
  isOver(s: S): boolean;
  /** Places; inner arrays are ties. */
  ranking(s: S): SeatIndex[][];
  bots: Record<BotLevel, (s: S, seat: SeatIndex, rules: R, rng: Rng) => A>;
}
