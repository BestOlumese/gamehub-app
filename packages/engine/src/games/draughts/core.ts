// Browser-safe draughts logic (no zod): legal moves, draw counts, clocks, board layout.
// The full GameDefinition is in ./index.ts.
import type { SeatIndex } from "../../types";
import { flagAt } from "../clock";
import { decode, genRules, geometry, legalMoves as gen, play, type Move } from "./board";
import { effective, type DraughtsRules, type Variant } from "./rules";
import type { Colour, DraughtsEndReason, DraughtsMove, DraughtsState } from "./state";

export const ply = (s: Pick<DraughtsState, "moves">) => s.moves.length;
export const other = (c: Colour): Colour => (c === "light" ? "dark" : "light");
export const signOf = (c: Colour) => (c === "light" ? 1 : -1);
export const seatOf = (s: Pick<DraughtsState, "light">, c: Colour, players = 2): SeatIndex =>
  c === "light" ? s.light : (s.light + 1) % players;
export const colourOf = (s: Pick<DraughtsState, "light">, seat: SeatIndex): Colour =>
  seat === s.light ? "light" : "dark";

export const toPublic = (m: Move): DraughtsMove => ({
  from: m.from + 1,
  path: m.path.map((x) => x + 1),
  captured: m.captured.map((x) => x + 1),
});
export const toInternal = (m: Pick<DraughtsMove, "from" | "path">): Move => ({
  from: m.from - 1,
  path: m.path.map((x) => x - 1),
  captured: [],
});

/** The side to move's legal moves (1-based squares). */
export function legalMoves(
  s: Pick<DraughtsState, "board" | "turn" | "variant">,
  rules: DraughtsRules,
) {
  const g = geometry(s.variant);
  const r = genRules(effective({ ...rules, variant: s.variant }));
  return gen(Int8Array.from(s.board), g, r, signOf(s.turn)).map(toPublic);
}

/** The board after a move (1-based), for showing your move before the server confirms it. */
export function afterMove(
  s: Pick<DraughtsState, "board" | "variant">,
  m: Pick<DraughtsMove, "from" | "path" | "captured">,
): number[] {
  const b = Int8Array.from(s.board);
  play(b, geometry(s.variant), {
    from: m.from - 1,
    path: m.path.map((x) => x - 1),
    captured: m.captured.map((x) => x - 1),
  });
  return Array.from(b);
}

/** "32-28", "28x19x10". */
export const notation = (m: DraughtsMove) =>
  [m.from, ...m.path].join(m.captured.length ? "x" : "-");

// ---- Draw counts, all read back from the position history ----

type Count = { lm: number; lk: number; dm: number; dk: number };
function count(pos: string): Count {
  const c = { lm: 0, lk: 0, dm: 0, dk: 0 };
  for (const ch of pos) {
    if (ch === "l") c.lm++;
    else if (ch === "L") c.lk++;
    else if (ch === "d") c.dm++;
    else if (ch === "D") c.dk++;
  }
  return c;
}
const total = (c: Count) => c.lm + c.lk + c.dm + c.dk;
const menOnly = (pos: string) => pos.replace(/[LD]/g, ".");

/** A man moved (or was crowned) or something was captured between these positions. */
const progress = (a: string, b: string) =>
  menOnly(a) !== menOnly(b) || total(count(a)) !== total(count(b));

/** Plies since the last man move or capture. */
export function quietPlies(history: readonly string[]): number {
  let n = 0;
  for (let i = history.length - 1; i > 0; i--) {
    if (progress(history[i - 1] as string, history[i] as string)) break;
    n++;
  }
  return n;
}

/** How many times the current position (same side to move) has occurred since the last man move or capture. */
export function repetitions(history: readonly string[]): number {
  const last = history.length - 1;
  const tip = history[last] as string;
  const quiet = quietPlies(history);
  let n = 0;
  for (let i = last; i >= last - quiet; i -= 2) if (history[i] === tip) n++;
  return n;
}

type Endgame = "kings" | 16 | 5 | null;
/** naija10 endgames (FMJD): a lone king against 3 pieces with a king (16 moves), or 2 or fewer (5). */
function endgameOf(c: Count): Endgame {
  const light = c.lm + c.lk;
  const dark = c.dm + c.dk;
  if (light === 1 && c.lk === 1 && dark === 1 && c.dk === 1) return "kings";
  const kind = (weak: number, weakKings: number, strong: number, strongKings: number): Endgame => {
    if (weak !== 1 || weakKings !== 1 || strongKings < 1) return null;
    if (strong === 3) return 16;
    if (strong <= 2) return 5;
    return null;
  };
  return kind(light, c.lk, dark, c.dk) ?? kind(dark, c.dk, light, c.lk);
}

/** Plies played in the current endgame (since its material was reached), and which one. */
export function endgame(history: readonly string[]): { kind: Endgame; plies: number } {
  const tip = history[history.length - 1] as string;
  const c = count(tip);
  const kind = endgameOf(c);
  if (kind === null) return { kind, plies: 0 };
  let plies = 0;
  for (let i = history.length - 2; i >= 0; i--) {
    const p = count(history[i] as string);
    if (endgameOf(p) !== kind || total(p) !== total(c)) break;
    plies++;
  }
  return { kind, plies };
}

/** naija10 25-move rule (kings only, 25 moves each); english8 40-move rule. In plies. */
export const NO_PROGRESS_PLIES: Record<Variant, number> = { naija10: 50, english8: 80 };

/** A draw by rule in the position just reached (after the side to move was checked for moves). */
export function drawByRule(
  s: Pick<DraughtsState, "history" | "variant">,
  rules: DraughtsRules,
): DraughtsEndReason | null {
  const naija = s.variant === "naija10";
  const eg = naija ? endgame(s.history) : { kind: null, plies: 0 };
  if (eg.kind === "kings") return "kings";
  if (repetitions(s.history) >= 3) return "threefold";
  if (rules.drawRules === "none") return null;
  if (quietPlies(s.history) >= NO_PROGRESS_PLIES[s.variant]) return "no_progress";
  if (eg.kind === 16 && eg.plies >= 32) return "endgame";
  if (eg.kind === 5 && eg.plies >= 10) return "endgame";
  return null;
}

/** Pieces left on each side, and how many each has taken (from the start count). */
export function seedCount(s: Pick<DraughtsState, "board" | "variant">) {
  const start = s.variant === "naija10" ? 20 : 12;
  let light = 0;
  let dark = 0;
  for (const v of s.board) {
    if (v > 0) light++;
    else if (v < 0) dark++;
  }
  return { light, dark, takenBy: { light: start - dark, dark: start - light } };
}

// ---- Clocks ----

/** Server time at which the side to move flags (clocked games, after both first moves). */
export function flagTime(s: DraughtsState): number | null {
  if (!s.clock || s.turnStartedAt === null || ply(s) < 2) return null;
  return flagAt(s.turnStartedAt, s.clock[s.turn]);
}

/** The abort window, then the flag, or the per-move limit in "No clock" games. Null once over. */
export function moveDeadline(s: DraughtsState, rules: DraughtsRules): number | null {
  if (s.result) return null;
  if (ply(s) === 0) return s.startedAt + rules.abortSeconds * 1000;
  if (ply(s) === 1) return (s.turnStartedAt ?? s.startedAt) + rules.abortSeconds * 1000;
  if (s.clock) return flagTime(s);
  return (s.turnStartedAt ?? s.startedAt) + rules.moveLimitSeconds * 1000;
}

/** What a clock shows at `now` (server time): the running side counts down, without the grace. */
export function clockShows(s: DraughtsState, c: Colour, now: number): number | null {
  if (!s.clock) return null;
  const side = s.clock[c];
  const running = !s.result && s.turnStartedAt !== null && ply(s) >= 2 && s.turn === c;
  return Math.max(
    0,
    running ? side.remainingMs - (now - (s.turnStartedAt as number)) : side.remainingMs,
  );
}

// ---- PDN (Portable Draughts Notation) ----

/** The position as a PDN FEN: side to move, then each side's squares, K for kings ("W:W31,K32:B1,2"). */
export function pdnFen(board: readonly number[], turn: Colour): string {
  const side = (sign: number) =>
    board
      .map((v, i) => (v * sign > 0 ? `${Math.abs(v) === 2 ? "K" : ""}${i + 1}` : null))
      .filter(Boolean)
      .join(",");
  return `${turn === "light" ? "W" : "B"}:W${side(1)}:B${side(-1)}`;
}

/** Moves in PDN order ("1. 32-28 19-23 2. ..."), White (light) first; a dark first move starts "1. ...". */
export function pdnMoves(moves: readonly DraughtsMove[], firstTurn: Colour): string {
  const out: string[] = [];
  let n = 1;
  let i = 0;
  if (firstTurn === "dark" && moves.length) {
    out.push(`1. ... ${notation(moves[0] as DraughtsMove)}`);
    n = 2;
    i = 1;
  }
  for (; i < moves.length; i += 2) {
    const pair = moves
      .slice(i, i + 2)
      .map(notation)
      .join(" ");
    out.push(`${n++}. ${pair}`);
  }
  return out.join(" ");
}

/** Who moved first: the side to move at the start, read back from the move count and turn. */
export const firstTurn = (s: Pick<DraughtsState, "moves" | "turn">): Colour =>
  s.moves.length % 2 === 0 ? s.turn : other(s.turn);

// ---- Layout ----

/**
 * Where a square (1-based) is drawn: column and row from the viewer's top-left. `flip` turns
 * the board for the dark player; the Nigerian orientation mirrors it (long diagonal on the right).
 */
export function squareAt(
  variant: Variant,
  orientation: DraughtsRules["orientation"],
  sq: number,
  flip: boolean,
): { col: number; row: number } {
  const g = geometry(variant);
  let col = g.col[sq - 1] as number;
  let row = g.row[sq - 1] as number;
  if (variant === "naija10" && orientation === "naija") col = g.size - 1 - col;
  if (flip) {
    col = g.size - 1 - col;
    row = g.size - 1 - row;
  }
  return { col, row };
}

export const boardSize = (v: Variant) => geometry(v).size;
export const boardOf = (pos: string) => Array.from(decode(pos));

export {
  draughtsEnglish,
  draughtsNaija,
  DRAUGHTS_TIME_PRESETS,
  effective,
  englishFixed,
  type DraughtsRules,
  type Variant,
} from "./rules";
export { timeLabel, type TimeControl } from "../clock";
export type {
  Colour,
  DraughtsAction,
  DraughtsEndReason,
  DraughtsMove,
  DraughtsState,
  DraughtsView,
} from "./state";
