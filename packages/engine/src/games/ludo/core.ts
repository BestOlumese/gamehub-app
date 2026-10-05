// Browser-safe Ludo logic (no zod). The full GameDefinition is in ./index.ts.
import type { SeatIndex } from "../../types";
import type { LudoRules } from "./rules";
import type { Colour, LudoState } from "./state";

/**
 * Playback timings. The server applies a whole turn at once; the client shows the die
 * (ROLL_SHOW_MS), then each hop (HOP_MS), then a beat (SETTLE_MS). Turn clocks wait the same.
 */
export const ROLL_SHOW_MS = 900;
export const HOP_MS = 90;
export const SETTLE_MS = 250;

export const TRACK = 52;
/** Steps from a colour's start square to home. */
export const HOME = 56;
/** Last progress value on the shared track; 51–55 is the home column. */
export const LAST_TRACK = 50;

export const COLOURS: readonly Colour[] = ["red", "green", "yellow", "blue"];
/** Track square where each colour comes out. */
export const START: Record<Colour, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
/** Start squares and stars (start + 8). */
export const SAFE_SQUARES: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/** Seat → colour. Two players sit opposite each other (red v yellow). */
export function coloursFor(players: number): Colour[] {
  if (players === 2) return ["red", "yellow"];
  return COLOURS.slice(0, players);
}

/** Absolute track square for a seed, or null when it's in the yard, home column or home. */
export function square(colour: Colour, p: number): number | null {
  return p >= 0 && p <= LAST_TRACK ? (START[colour] + p) % TRACK : null;
}

export const isSafe = (sq: number, rules: LudoRules) => rules.safeSquares && SAFE_SQUARES.has(sq);

/** Seeds of other seats on a track square. */
function rivalsAt(s: LudoState, seat: SeatIndex, sq: number) {
  const out: Array<{ seat: SeatIndex; seed: number }> = [];
  s.seeds.forEach((seeds, other) => {
    if (other === seat) return;
    const colour = s.colours[other] as Colour;
    seeds.forEach((p, seed) => {
      if (square(colour, p) === sq) out.push({ seat: other, seed });
    });
  });
  return out;
}

/** A square holding two or more seeds of one rival colour. */
function blockedBy(s: LudoState, seat: SeatIndex, sq: number) {
  const counts = new Map<SeatIndex, number>();
  for (const r of rivalsAt(s, seat, sq)) counts.set(r.seat, (counts.get(r.seat) ?? 0) + 1);
  return [...counts.values()].some((n) => n >= 2);
}

/** Where a seed would end up with this roll, or null if it can't move. */
export function target(s: LudoState, seat: SeatIndex, seed: number, d: number, rules: LudoRules) {
  const p = s.seeds[seat]?.[seed];
  if (p === undefined || p === HOME) return null;
  const colour = s.colours[seat] as Colour;
  if (p === -1) {
    if (rules.needSixToLeaveYard && d !== 6) return null;
    if (rules.blockades && blockedBy(s, seat, START[colour])) return null;
    return 0;
  }
  let to = p + d;
  if (to > HOME) {
    if (rules.exactRollToFinish) return null;
    to = HOME;
  }
  if (rules.blockades) {
    for (let q = p + 1; q <= Math.min(to, LAST_TRACK); q++) {
      if (blockedBy(s, seat, square(colour, q) as number)) return null;
    }
  }
  return to;
}

/** Seeds the player on turn could move with roll `d`. */
export function legalSeeds(s: LudoState, d: number, rules: LudoRules): number[] {
  return [0, 1, 2, 3].filter((seed) => target(s, s.turn, seed, d, rules) !== null);
}

/** The rivals a seed landing on progress `to` would capture. */
export function capturesAt(s: LudoState, seat: SeatIndex, to: number, rules: LudoRules) {
  if (!rules.captureSendsHome) return [];
  const sq = square(s.colours[seat] as Colour, to);
  if (sq === null || isSafe(sq, rules)) return [];
  return rivalsAt(s, seat, sq);
}

/** Next seat still playing. */
export function nextSeat(from: SeatIndex, players: number, finished: readonly SeatIndex[]) {
  let seat = from;
  for (let i = 0; i < players; i++) {
    seat = (seat + 1) % players;
    if (!finished.includes(seat)) return seat;
  }
  return from;
}

/** Total steps made by a seat's seeds (yard counts as 0); ranks unfinished players. */
export const progressOf = (seeds: readonly number[]) => seeds.reduce((t, p) => t + p + 1, 0);

export { ludoNaija, type LudoRules } from "./rules";
export type { Colour, LudoAction, LudoState, LudoView } from "./state";
