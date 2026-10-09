// Browser-safe chess logic (no zod): clocks, repetition, material. The full GameDefinition is in
// ./index.ts. chess.js is BSD-2, so the client may use it for legal-move dots and premoves.
import type { SeatIndex } from "../../types";
import { chargeMove, flagAt, initLag, newClockSide } from "../clock";
import type { ChessRules } from "./rules";
import type { ChessState, Side } from "./state";

export { chargeMove, initLag, newClockSide };

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const sideToMove = (fen: string): Side => (fen.split(" ")[1] === "b" ? "b" : "w");
export const ply = (s: Pick<ChessState, "moves">) => s.moves.length;
export const other = (side: Side): Side => (side === "w" ? "b" : "w");
export const seatOf = (s: Pick<ChessState, "white">, side: Side, players = 2): SeatIndex =>
  side === "w" ? s.white : (s.white + 1) % players;
export const sideOf = (s: Pick<ChessState, "white">, seat: SeatIndex): Side =>
  seat === s.white ? "w" : "b";

/** Server time at which the side to move flags (clocked games, after both first moves). */
export function flagTime(s: ChessState): number | null {
  if (!s.clock || s.turnStartedAt === null || ply(s) < 2) return null;
  const c = s.clock[sideToMove(s.fen)];
  return flagAt(s.turnStartedAt, c);
}

/**
 * When the side to move runs out of time to act: the abort window before both first moves,
 * then the clock's flag time, or the per-move limit in "No clock" games. Null once it's over.
 */
export function moveDeadline(s: ChessState, rules: ChessRules): number | null {
  if (s.result) return null;
  if (ply(s) === 0) return s.startedAt + rules.abortSeconds * 1000;
  if (ply(s) === 1) return (s.turnStartedAt ?? s.startedAt) + rules.abortSeconds * 1000;
  if (s.clock) return flagTime(s);
  return (s.turnStartedAt ?? s.startedAt) + rules.moveLimitSeconds * 1000;
}

/** What a clock shows at `now` (server time): the running side counts down, without the grace. */
export function clockShows(s: ChessState, side: Side, now: number): number | null {
  if (!s.clock) return null;
  const c = s.clock[side];
  const running =
    !s.result && s.turnStartedAt !== null && ply(s) >= 2 && sideToMove(s.fen) === side;
  return Math.max(0, running ? c.remainingMs - (now - (s.turnStartedAt as number)) : c.remainingMs);
}

/** Position key for repetition: placement, side, castling, en passant (chess.js omits a useless e.p. square). */
export const repetitionKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** How many times the current position has occurred since the last pawn move or capture. */
export function repetitions(s: Pick<ChessState, "history" | "fen">): number {
  const halfmove = Number(s.fen.split(" ")[4] ?? 0);
  const key = repetitionKey(s.fen);
  // Positions since the last irreversible move are the last `halfmove` + 1 entries.
  return s.history.slice(-(halfmove + 1)).filter((f) => repetitionKey(f) === key).length;
}

export const halfmoveClock = (fen: string) => Number(fen.split(" ")[4] ?? 0);

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/**
 * Pieces each side has captured (from what's missing on the board) and the material lead.
 * Promotions count as the promoted piece, so a lost pawn may show up as "missing" in its place.
 */
export function material(fen: string) {
  const placement = fen.split(" ")[0] ?? "";
  const count = { w: {} as Record<string, number>, b: {} as Record<string, number> };
  for (const ch of placement) {
    if (!/[pnbrqk]/i.test(ch)) continue;
    const side = ch === ch.toUpperCase() ? "w" : "b";
    const t = ch.toLowerCase();
    count[side][t] = (count[side][t] ?? 0) + 1;
  }
  const captured = { w: [] as string[], b: [] as string[] }; // pieces taken BY that side
  for (const t of ["q", "r", "b", "n", "p"]) {
    for (const side of ["w", "b"] as const) {
      const lost = (START_COUNT[t] ?? 0) - (count[side][t] ?? 0);
      for (let i = 0; i < lost; i++) captured[side === "w" ? "b" : "w"].push(t);
    }
  }
  const score = (side: "w" | "b") =>
    Object.entries(count[side]).reduce((t, [p, n]) => t + (VALUES[p] ?? 0) * n, 0);
  const diff = score("w") - score("b");
  return { captured, lead: { w: Math.max(0, diff), b: Math.max(0, -diff) } };
}

/** Can this side still deliver mate in principle? Only a bare king, or king + one minor, can't. */
export function canMate(fen: string, side: Side): boolean {
  const placement = fen.split(" ")[0] ?? "";
  const mine = [...placement].filter((ch) =>
    side === "w" ? /[PNBRQ]/.test(ch) : /[pnbrq]/.test(ch),
  );
  if (mine.length === 0) return false;
  if (mine.length === 1 && /[nbNB]/.test(mine[0] as string)) return false;
  return true;
}

export {
  chessNaija,
  speedOf,
  TIME_PRESETS,
  timeLabel,
  type ChessRules,
  type Speed,
  type TimeControl,
} from "./rules";
export type { ChessAction, ChessEndReason, ChessState, ChessView, ClockSide, Side } from "./state";
export { Chess } from "chess.js";
