// Each minute's build-up (Best, Oct 2026: "goals just happen without seeing the process"). After
// the minute is decided, this writes who had the ball and how it moved, ending exactly at what
// the minute's events say (the assister, the shooter, the fouled man, the runner caught
// offside). It draws from its own random stream, so it never changes a result. The live viewer
// plays it, and the timeline (`timeline.ts`) turns it into screen time.
import type { Rng } from "../../types";
import type { ChanceKind, MatchEvent, MatchState, Side, TeamState } from "./match";
import { formation } from "./pitch";
import type { Position } from "./types";

/**
 * How the ball reached this player: k kickoff, g the keeper's ball (save, goal kick), w won it
 * back, p pass, l long ball, t through ball, c cross, d carried it himself (a dribble).
 */
export type TouchKind = "k" | "g" | "w" | "p" | "l" | "t" | "c" | "d";
export type Touch = [player: string, how: TouchKind];

/** Why play restarts this minute (set by the minute before). */
export type Restart = "kickoff" | "keeper" | "free_kick";

const WIDE: ReadonlySet<Position> = new Set(["RB", "LB", "RWB", "LWB", "RM", "LM", "RW", "LW"]);
const LEFT: ReadonlySet<Position> = new Set(["LB", "LWB", "LM", "LW"]);
const RIGHT: ReadonlySet<Position> = new Set(["RB", "RWB", "RM", "RW"]);

type Band = "back" | "mid" | "front" | "wide" | "box";

function inBand(pos: Position, y: number, b: Band): boolean {
  if (pos === "GK") return false;
  switch (b) {
    case "back":
      return y < 40;
    case "mid":
      return y >= 34 && y <= 66;
    case "front":
      return y >= 58;
    case "wide":
      return WIDE.has(pos);
    case "box":
      return pos === "ST" || pos === "AM" || pos === "RW" || pos === "LW";
  }
}

/** The minute's build-up for `side`, ending where the minute's events say. */
export function buildPath(o: {
  m: MatchState;
  side: Side;
  /** Who had the ball the minute before. */
  prevSide: Side;
  restart: Restart | null;
  /** Where the ball was last minute (for whoever had it). */
  prevZone: 0 | 1 | 2;
  zone: 0 | 1 | 2;
  /** This minute's events (after the "ball" event). */
  events: readonly MatchEvent[];
  rng: Rng;
}): Touch[] {
  const T: TeamState = o.m.teams[o.side];
  const slots = formation(T.formation).slots;
  const team = T.xi
    .map((x, i) => ({ id: x.id, pos: x.pos, y: slots[i]?.y ?? 50, off: x.off }))
    .filter((p) => !p.off);
  const keeper = team.find((p) => p.pos === "GK")?.id;
  const outfield = team.filter((p) => p.pos !== "GK");
  const path: Touch[] = [];
  const holder = () => path.at(-1)?.[0];
  /** Someone in `band` (not the man on the ball, nor anyone in `not`), at random. */
  const pick = (
    band: Band,
    not: ReadonlyArray<string | undefined> = [],
    side?: "left" | "right",
  ) => {
    const avoid = new Set([holder(), ...not]);
    const fits = outfield.filter(
      (p) =>
        !avoid.has(p.id) &&
        inBand(p.pos, p.y, band) &&
        (!side || (side === "left" ? LEFT : RIGHT).has(p.pos)),
    );
    const pool = fits.length ? fits : outfield.filter((p) => !avoid.has(p.id));
    const any = pool.length ? pool : outfield;
    return any[o.rng.int(Math.max(1, any.length))]?.id ?? keeper ?? T.xi[0]?.id ?? "";
  };
  const add = (id: string, how: TouchKind) => {
    if (id && id !== holder()) path.push([id, how]);
  };

  // 1. How the ball comes to them.
  // The move starts where the ball was: from their own view if they kept it, the other way
  // round if they won it (a ball in the opponent's final third is in their own third).
  const from = o.restart ? 0 : o.prevSide === o.side ? o.prevZone : ((2 - o.prevZone) as 0 | 1 | 2);
  const startBand: Band = from === 0 ? "back" : from === 1 ? "mid" : "front";
  if (o.restart === "kickoff") add(pick("mid"), "k");
  else if (o.restart === "keeper" && keeper) add(keeper, "g");
  else if (o.restart === "free_kick") add(pick("back"), "w");
  else if (o.prevSide !== o.side) add(pick(startBand === "front" ? "mid" : startBand), "w");
  else add(pick(startBand), "p");

  // 2. What the minute became: the first chance, offside, or foul on them.
  const first = o.events.find(
    (e) => e.t === "chance" || e.t === "offside" || (e.t === "foul" && e.team !== o.side),
  );
  const build = T.tactics.build;
  const flank = T.instructions?.flank ?? "mixed";
  const side = flank === "left" || flank === "right" ? flank : undefined;
  const r = (n: number) => o.rng.int(n);

  if (first?.t === "chance" && first.kind !== "corner" && first.kind !== "free_kick") {
    const kind: ChanceKind = first.kind;
    const shooter = first.player;
    const assist = first.assist;
    const keep = [shooter, assist];
    // Patient sides pass more before the final ball; direct ones go long early.
    // Patient sides pass more; from deep it takes more passes to get there.
    // Enough passes to cover the ground: a real pass moves it on about 12–16 m, a long ball
    // about 30, so from their own third it takes four or so (or a long ball and a couple).
    const deep = startBand === "back" ? 4 : startBand === "mid" ? 2 : 0;
    const n =
      kind === "counter"
        ? r(2) + Math.ceil(deep / 2)
        : kind === "direct" || build === "long"
          ? 1 + Math.ceil(deep / 2)
          : (build === "short" || kind === "build_up" ? 1 + r(2) : r(2)) + deep;
    const bands: Band[] = ["back", "mid", "mid", "front"];
    let at = Math.max(0, bands.indexOf(startBand));
    for (let i = 0; i < n; i++) {
      at = Math.min(bands.length - 1, at + (i === n - 1 || r(2) ? 1 : 0));
      const band = kind === "cross" && i === n - 1 ? "wide" : (bands[at] as Band);
      // Long-ball sides go long from the back; everyone else mostly passes it short.
      const long = (kind === "direct" || build === "long") && (i === 0 || i === n - 1);
      add(pick(band, keep, kind === "cross" && i === n - 1 ? side : undefined), long ? "l" : "p");
    }
    if (assist) {
      add(assist, kind === "direct" ? "l" : kind === "counter" ? "t" : "p");
      // Crossers and counter-attackers carry it before the final ball.
      if (kind === "cross" || kind === "counter") path.push([assist, "d"]);
    }
    const final: TouchKind =
      kind === "through_ball"
        ? "t"
        : kind === "cross"
          ? "c"
          : kind === "direct"
            ? "l"
            : kind === "counter"
              ? assist
                ? "t"
                : "d"
              : "p";
    add(shooter, final);
    // He drives at goal before he shoots: a long shot, a counter, a ball in behind or over the top.
    if (
      kind === "long_shot" ||
      kind === "counter" ||
      kind === "through_ball" ||
      kind === "direct" ||
      (kind === "build_up" && r(2) === 0)
    )
      path.push([shooter, "d"]);
  } else if (first?.t === "offside" && first.player) {
    add(pick("mid", [first.player]), "p");
    add(first.player, "t");
  } else if (first?.t === "foul") {
    // Someone of theirs is brought down on the ball; a free kick they shoot from is given in
    // the final third, so that move gets up there first.
    const shootable = o.events.some((e) => e.t === "free_kick");
    if (shootable) {
      const steps = startBand === "back" ? 4 : startBand === "mid" ? 2 : 1;
      for (let i = 0; i < steps; i++) add(pick(i === steps - 1 ? "front" : "mid"), "p");
    } else add(pick(startBand === "back" ? "mid" : startBand), "p");
  } else if (first?.t === "chance") {
    // A free kick or corner chance with no open play before it: a pass or two.
    add(pick(startBand), "p");
  } else {
    // A quiet minute: keep it, a pass or two (a carry now and then).
    const n = 1 + r(2);
    for (let i = 0; i < n; i++) add(pick(i ? "mid" : startBand), "p");
    const h = holder();
    if (h && r(3) === 0) path.push([h, "d"]);
  }
  return path;
}
