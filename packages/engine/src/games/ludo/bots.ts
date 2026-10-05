import type { Rng, SeatIndex } from "../../types";
import { capturesAt, HOME, isSafe, LAST_TRACK, square, START, target, TRACK } from "./core";
import type { LudoRules } from "./rules";
import type { Colour, LudoAction, LudoState } from "./state";

type Bot = (s: LudoState, seat: SeatIndex, rules: LudoRules, rng: Rng) => LudoAction;

/**
 * Chance (roughly) that a seed of `seat` sitting on track square `sq` is hit next round:
 * 1/6 for each rival seed 1–6 squares behind it that could still reach it, plus rivals
 * that could come out of the yard onto it.
 */
function threat(s: LudoState, seat: SeatIndex, sq: number, rules: LudoRules): number {
  if (!rules.captureSendsHome || isSafe(sq, rules)) return 0;
  let hits = 0;
  s.seeds.forEach((seeds, other) => {
    if (other === seat) return;
    const colour = s.colours[other] as Colour;
    for (const p of seeds) {
      const at = square(colour, p);
      if (at !== null) {
        const dist = (sq - at + TRACK) % TRACK;
        if (dist >= 1 && dist <= 6 && p + dist <= LAST_TRACK) hits++;
      } else if (p === -1 && sq === START[colour]) {
        hits++; // comes out on a 6 and lands right on us
      }
    }
  });
  return Math.min(1, hits / 6);
}

type Option = { seed: number; from: number; to: number; captures: number; captured: number };

function options(s: LudoState, seat: SeatIndex, rules: LudoRules): Option[] {
  const d = s.die ?? 0;
  return s.movable.map((seed) => {
    const from = s.seeds[seat]?.[seed] ?? -1;
    const to = target(s, seat, seed, d, rules) ?? from;
    const victims = capturesAt(s, seat, to, rules);
    const captured = victims.reduce((t, v) => t + (s.seeds[v.seat]?.[v.seed] ?? 0) + 1, 0);
    return { seed, from, to, captures: victims.length, captured };
  });
}

const colourOf = (s: LudoState, seat: SeatIndex) => s.colours[seat] as Colour;

/** True when the seed would rest somewhere no one can hit it. */
function sheltered(s: LudoState, seat: SeatIndex, p: number, rules: LudoRules) {
  if (p > LAST_TRACK) return true; // home column or home
  const sq = square(colourOf(s, seat), p);
  return sq !== null && isSafe(sq, rules);
}

const pick = (opts: Option[], score: (o: Option) => number) =>
  opts.reduce((best, o) => (score(o) > score(best) ? o : best));

const easy: Bot = (s, _seat, _rules, rng) => {
  if (s.phase === "roll") return { type: "roll" };
  return { type: "move", seed: s.movable[rng.int(s.movable.length)] ?? 0 };
};

/** Fixed priorities: capture, come out on a 6, reach safety, then push the leading seed. */
const medium: Bot = (s, seat, rules) => {
  if (s.phase === "roll") return { type: "roll" };
  const opts = options(s, seat, rules);
  const best = pick(opts, (o) => {
    let v = o.to / 10;
    if (o.captures) v += 100;
    if (o.to === HOME) v += 80;
    if (o.from === -1) v += 60;
    if (sheltered(s, seat, o.to, rules)) v += 30;
    const sq = square(colourOf(s, seat), o.to);
    if (sq !== null && threat(s, seat, sq, rules) > 0) v -= 25;
    return v;
  });
  return { type: "move", seed: best.seed };
};

/** Weighs what each move gains against how likely the seed is to be sent home for it. */
const hard: Bot = (s, seat, rules) => {
  if (s.phase === "roll") return { type: "roll" };
  const colour = colourOf(s, seat);
  const risk = (p: number) => {
    const sq = square(colour, p);
    return sq === null ? 0 : threat(s, seat, sq, rules) * (p + 25);
  };
  const best = pick(options(s, seat, rules), (o) => {
    let v = o.to - Math.max(o.from, 0);
    v += o.captured + o.captures * 30;
    if (o.to === HOME) v += 45;
    if (o.from === -1) v += 35;
    if (o.from <= LAST_TRACK && o.to > LAST_TRACK) v += 15; // into the home column
    v -= risk(o.to);
    if (o.from >= 0) v += risk(o.from); // getting out of danger counts
    return v;
  });
  return { type: "move", seed: best.seed };
};

export const ludoBots = { easy, medium, hard };
