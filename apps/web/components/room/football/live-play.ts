// The live 2D viewer's script (design decisions, Oct 2026): all 22 players, the ball going to
// whoever is on it, teams moving with the ball, goals, corners and shoot-outs. Pure: from the
// match events (`playback.ts` timings) it plans the ball's journey (passes, crosses, shots) and
// the shape each side should be in; `live-pitch.tsx` moves the players towards it frame by frame.
// Every choice comes from a hash of the events, so the same match plays out the same way.
//
// Pitch coordinates: x 0 (left goal line) → 100 (right), y 0 (top touchline) → 100 (bottom).
// Home (side 0) attacks right, away attacks left. A shoot-out is taken at the right-hand goal.
import {
  formation,
  PEN_MS,
  type Position,
  type Tactics,
  type TeamSheet,
} from "@gamehub/engine/football";
import type { Timed } from "./playback";

export type Side = 0 | 1;
export type Pt = { x: number; y: number };

/** How long a booking rings on the player (and a sent-off player stays on). */
export const CARD_MS = 1800;
/** The shoot-out spot and goal line (right-hand goal). */
export const PEN_SPOT: Pt = { x: 88.5, y: 50 };

export type Beat =
  /** Everyone back to their kickoff places, the ball on the centre spot. */
  | { at: number; k: "reset" }
  /** The ball travels to a player, along the ground or in the air. */
  | { at: number; k: "pass"; to: string; dur: number; loft: boolean }
  /** The ball is at this player's feet at once (a keeper's save, a free kick). */
  | { at: number; k: "hold"; player: string }
  /** Play stops for a moment (a foul, an offside flag). */
  | { at: number; k: "stop" }
  /** A shot: into the net, to the keeper, wide, off the post or into a defender. */
  | {
      at: number;
      k: "shot";
      side: Side;
      result: "goal" | "keeper" | "wide" | "post" | "block";
      dur: number;
      y: number;
    }
  /** A corner: the taker at the flag. */
  | { at: number; k: "corner"; side: Side; taker: string; y: number }
  /** A goal: the scorer runs off to celebrate. */
  | { at: number; k: "celebrate"; scorer: string; side: Side; y: number }
  /** A shoot-out kick: the taker walks up from `at`, strikes at `kick`. */
  | {
      at: number;
      k: "pen";
      taker: string;
      keeper: string;
      side: Side;
      kick: number;
      /** Who takes the next one (he walks up while this one is celebrated or rued). */
      nextTaker: string | null;
      result: "scored" | "saved";
      y: number;
    };

export type Mode = "kickoff" | "open" | "box" | "celebrate" | "pens";
export type Plan = {
  beats: Beat[];
  /** Shape changes: kickoff, open play, a crowded box at a corner (`side` attacking), a goal, pens. */
  modes: Array<{ at: number; mode: Mode; side: Side | null }>;
};

/** A goal's celebration: long enough to read the banner, not so long it hides the next minutes. */
export const celebrationMs = (perMinute: number) =>
  Math.round(Math.min(2400, Math.max(1500, perMinute * 2)));

/** A small, stable hash for choosing between players. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type Lineup = {
  /** Player id in each slot, per side. */
  ids: [Array<string | null>, Array<string | null>];
  formation: [number, number];
};

/**
 * Who's on at `at`: the current sheets with subs still to come undone (latest first), and
 * sent-off players gone once their card has had its moment (`cardGrace`).
 */
export function lineupAt(
  timed: readonly Timed[],
  current: readonly [TeamSheet, TeamSheet],
  at: number,
  cardGrace = CARD_MS,
): Lineup {
  const ids = current.map((s) => s.xi.map((x) => x.id as string | null)) as Lineup["ids"];
  for (let i = timed.length - 1; i >= 0; i--) {
    const t = timed[i] as Timed;
    if (t.at <= at) break;
    if (t.e.t === "sub") {
      const list = ids[t.e.team];
      const k = list.indexOf(t.e.on);
      if (k >= 0) list[k] = t.e.off;
    }
  }
  for (const t of timed) {
    if (t.at > at) break;
    const e = t.e;
    if (
      e.t === "foul" &&
      (e.card === "red" || e.card === "second_yellow") &&
      at - t.at > cardGrace
    ) {
      const list = ids[e.team];
      const k = list.indexOf(e.player);
      if (k >= 0) list[k] = null;
    }
  }
  return { ids, formation: [current[0].formation, current[1].formation] };
}

/** Tactics as shown so far: kickoff's, then each "tactics" line. */
export function tacticsAt(
  timed: readonly Timed[],
  kick: readonly [TeamSheet, TeamSheet],
  at: number,
): [Tactics, Tactics] {
  const t: [Tactics, Tactics] = [kick[0].tactics, kick[1].tactics];
  for (const x of timed) {
    if (x.at > at) break;
    if (x.e.t === "tactics") t[x.e.team] = x.e.tactics;
  }
  return t;
}

/** The latest booking still ringing at `at`. */
export function cardAt(
  timed: readonly Timed[],
  at: number,
): { id: string; colour: "yellow" | "red" } | null {
  for (let i = timed.length - 1; i >= 0; i--) {
    const t = timed[i] as Timed;
    if (t.at > at) continue;
    if (at - t.at > CARD_MS) break;
    if (t.e.t === "foul" && t.e.card)
      return { id: t.e.player, colour: t.e.card === "yellow" ? "yellow" : "red" };
  }
  return null;
}

/** Bands of the pitch by a slot's depth: 0 at the back, 1 midfield, 2 up front, "box" for headers. */
type Band = 0 | 1 | 2 | "box" | "wide";
const BOX: ReadonlySet<Position> = new Set(["ST", "AM", "RW", "LW", "CB"]);
const WIDE: ReadonlySet<Position> = new Set(["RW", "LW", "RM", "LM", "RWB", "LWB", "RB", "LB"]);
function inBand(pos: Position, y: number, band: Band): boolean {
  if (pos === "GK") return false;
  if (band === "box") return BOX.has(pos);
  if (band === "wide") return WIDE.has(pos);
  return band === 0 ? y < 40 : band === 1 ? y >= 34 && y <= 66 : y >= 58;
}

const PLACING = new Set([
  "kickoff",
  "et_start",
  "half_time",
  "full_time",
  "et_half",
  "et_end",
  "ball",
  "chance",
  "shot",
  "goal",
  "save",
  "corner",
  "free_kick",
  "offside",
  "foul",
  "pen",
]);
const RESTARTS = new Set(["kickoff", "et_start", "half_time", "full_time", "et_half", "et_end"]);

/** Plans the ball's journey and the shapes for a whole log. */
export function planPlay(
  timed: readonly Timed[],
  current: readonly [TeamSheet, TeamSheet],
  perMinute: number,
): Plan {
  const beats: Beat[] = [];
  const modes: Plan["modes"] = [];
  let mode: Mode | null = null;
  const setMode = (at: number, m: Mode, side: Side | null = null) => {
    if (m === mode && m !== "box" && m !== "celebrate") return;
    mode = m;
    modes.push({ at, mode: m, side });
  };
  let carrier: string | null = null;
  let carrierSide: Side | null = null;
  let band: 0 | 1 | 2 = 1;
  let lastBeat = -Infinity;
  /** No open play while a goal is celebrated (the ticker carries on underneath). */
  let quietUntil = -Infinity;
  const celebrate = celebrationMs(perMinute);

  const push = (b: Beat) => {
    beats.push(b);
    lastBeat = b.at;
  };
  /** Someone of `side` in `band` at time `at` (not `not`), chosen by `salt`. */
  const pick = (side: Side, b: Band, at: number, salt: string, not: string | null) => {
    const line = lineupAt(timed, current, at, 0);
    const slots = formation(line.formation[side]).slots;
    const all = slots.flatMap((s, i) => {
      const id = line.ids[side][i];
      return id && id !== not && s.pos !== "GK" ? [{ id, ok: inBand(s.pos, s.y, b) }] : [];
    });
    const pool = all.some((x) => x.ok) ? all.filter((x) => x.ok) : all;
    return pool.length ? (pool[hash(salt) % pool.length] as { id: string }).id : null;
  };
  const keeperOf = (side: Side, at: number) => {
    const line = lineupAt(timed, current, at, 0);
    const i = formation(line.formation[side]).slots.findIndex((s) => s.pos === "GK");
    return line.ids[side][i] ?? null;
  };
  /** A pass that arrives at `by` (or as close after the last beat as it can). */
  const passTo = (to: string, by: number, loft: boolean, maxDur = 420) => {
    const start = Math.max(lastBeat + 60, by - maxDur);
    push({ at: start, k: "pass", to, dur: Math.max(120, by - start), loft });
  };

  for (let i = 0; i < timed.length; i++) {
    const { e, at } = timed[i] as Timed;
    if (!PLACING.has(e.t)) continue;
    let next = at + perMinute;
    for (let j = i + 1; j < timed.length; j++)
      if (PLACING.has((timed[j] as Timed).e.t)) {
        next = (timed[j] as Timed).at;
        break;
      }
    const gap = Math.max(150, next - at);
    const salt = `${e.m}:${e.t}:${i}`;
    if (RESTARTS.has(e.t)) {
      if (at < quietUntil) continue;
      push({ at, k: "reset" });
      setMode(at, "kickoff");
      carrier = null;
      carrierSide = null;
      band = 1;
      continue;
    }
    if (e.t === "pen") {
      // Shoot-out: the taker walks up, strikes, the keeper dives (the wrong way when it goes in;
      // a miss is always the keeper's save, as the commentary tells it).
      const firstPen = mode !== "pens";
      if (firstPen) setMode(at - PEN_MS, "pens");
      const result = e.scored ? "scored" : "saved";
      const left = hash(`${salt}:corner`) % 2 === 0;
      const prev = beats.findLast((b) => b.k === "pen");
      if (prev?.k === "pen") prev.nextTaker = e.taker;
      push({
        // The last kick's result stays on screen for a moment before this one starts.
        at: firstPen ? at - PEN_MS : at - PEN_MS + 650,
        k: "pen",
        taker: e.taker,
        keeper: e.keeper,
        side: e.team,
        kick: at - 260,
        nextTaker: null,
        result,
        y: left ? 45.5 : 54.5,
      });
      continue;
    }
    if (at < quietUntil && e.t !== "goal" && e.t !== "shot" && e.t !== "corner") continue;
    switch (e.t) {
      case "ball": {
        if (mode !== "open") setMode(at, "open");
        const side = e.team;
        if (carrierSide !== side || !carrier) {
          // They win it (or start from a restart) where the ball was.
          const from: 0 | 1 | 2 = carrierSide === null ? 1 : ((2 - band) as 0 | 1 | 2);
          const r = pick(side, from, at, `${salt}:win`, null);
          if (r) {
            push({ at, k: "pass", to: r, dur: Math.min(420, gap * 0.4), loft: false });
            carrier = r;
            carrierSide = side;
            band = from;
          }
        }
        if (e.zone !== band || hash(`${salt}:move`) % 3 === 0) {
          const r = pick(side, e.zone, at, `${salt}:to`, carrier);
          if (r) {
            const loft = Math.abs(e.zone - band) >= 2 || hash(`${salt}:loft`) % 6 === 0;
            const start = Math.max(lastBeat + 60, at + gap * 0.45);
            push({
              at: start,
              k: "pass",
              to: r,
              dur: Math.max(140, Math.min(loft ? 650 : 480, at + gap * 0.95 - start)),
              loft,
            });
            carrier = r;
            band = e.zone;
          }
        }
        break;
      }
      case "chance": {
        setMode(at, "open");
        if (carrier !== e.player)
          passTo(e.player, at, e.kind === "cross" || e.kind === "corner" || e.kind === "free_kick");
        carrier = e.player;
        carrierSide = e.team;
        band = 2;
        break;
      }
      case "shot": {
        if (at < quietUntil) quietUntil = -Infinity;
        if (mode !== "open") setMode(at, "open");
        if (carrier !== e.player) passTo(e.player, at, !!e.header, 380);
        const result =
          e.result === "goal"
            ? "goal"
            : e.result === "saved"
              ? "keeper"
              : e.result === "missed"
                ? "wide"
                : e.result === "post"
                  ? "post"
                  : "block";
        const h = hash(`${salt}:aim`) % 2 === 0;
        push({
          at,
          k: "shot",
          side: e.team,
          result,
          dur: Math.max(150, Math.min(420, gap * 0.85)),
          y:
            result === "wide" ? (h ? 36 : 64) : result === "post" ? (h ? 44.6 : 55.4) : h ? 46 : 54,
        });
        carrier = null;
        break;
      }
      case "goal": {
        push({
          at,
          k: "celebrate",
          scorer: e.player,
          side: e.team,
          y: hash(salt) % 2 ? 8 : 92,
        });
        setMode(at, "celebrate", e.team);
        quietUntil = at + celebrate;
        push({ at: at + celebrate, k: "reset" });
        setMode(at + celebrate, "kickoff");
        carrier = null;
        carrierSide = null;
        band = 1;
        break;
      }
      case "save": {
        push({ at: Math.max(at, lastBeat + 60), k: "hold", player: e.keeper });
        carrier = e.keeper;
        carrierSide = e.team;
        band = 0;
        break;
      }
      case "corner": {
        if (at < quietUntil) quietUntil = -Infinity;
        const taker = e.player ?? pick(e.team, "wide", at, `${salt}:taker`, null);
        if (!taker) break;
        setMode(at, "box", e.team);
        const y = hash(salt) % 2 ? 1.5 : 98.5;
        push({ at, k: "corner", side: e.team, taker, y });
        const r = pick(e.team, "box", at, `${salt}:head`, taker);
        if (r) {
          const start = at + gap * 0.55;
          push({ at: start, k: "pass", to: r, dur: Math.max(160, gap * 0.4), loft: true });
          carrier = r;
        }
        carrierSide = e.team;
        band = 2;
        break;
      }
      case "free_kick": {
        if (e.player) {
          push({ at: Math.max(at, lastBeat + 60), k: "hold", player: e.player });
          carrier = e.player;
          carrierSide = e.team;
        }
        break;
      }
      case "offside": {
        push({ at: Math.max(at, lastBeat + 60), k: "stop" });
        // Their free kick, from the back.
        const other = (1 - e.team) as Side;
        const r = pick(other, 0, at, `${salt}:fk`, null) ?? keeperOf(other, at);
        if (r) {
          push({ at: at + gap * 0.5, k: "hold", player: r });
          carrier = r;
          carrierSide = other;
          band = 0;
        }
        break;
      }
      case "foul": {
        push({ at: Math.max(at, lastBeat + 60), k: "stop" });
        break;
      }
    }
  }
  beats.sort((a, b) => a.at - b.at);
  modes.sort((a, b) => a.at - b.at);
  return { beats, modes };
}

/** The latest item at or before `at` in a list sorted by time (binary search). */
export function latest<T extends { at: number }>(list: readonly T[], at: number): T | null {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid] as T).at <= at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 ? (list[found] as T) : null;
}

/**
 * Where a player wants to be in the side's shape, before individual jobs (pressing, receiving,
 * dribbling). `ball` is where the ball is now; `poss` who has it (null: nobody, a restart).
 */
export function shapeSpot(
  side: Side,
  slot: { pos: Position; x: number; y: number },
  t: Tactics,
  mode: Mode,
  ball: Pt,
  poss: Side | null,
  boxSide: Side | null,
): Pt {
  // Work in the side's own frame: u from its goal (0) to the other (100), v across (0 = its left).
  const bu = side === 0 ? ball.x : 100 - ball.x;
  const bv = side === 0 ? ball.y : 100 - ball.y;
  const gk = slot.pos === "GK";
  let u: number;
  let v: number;
  if (mode === "kickoff" || mode === "celebrate" || mode === "pens") {
    u = gk ? 4 : 20 + ((slot.y - 18) / 68) * 26;
    v = 50 + (slot.x - 50) * 0.85;
  } else if (mode === "box") {
    const attacking = side === boxSide;
    if (gk) {
      u = attacking ? 17 : 2;
      v = 50;
    } else if (attacking) {
      // Most go up for it; the two deepest stay back.
      const stay = slot.y < 22;
      u = stay ? 45 : 82 + ((slot.y - 18) / 68) * 10;
      v = 50 + (slot.x - 50) * (stay ? 0.8 : 0.45);
    } else {
      u = 3 + ((slot.y - 18) / 68) * 14;
      v = 50 + (slot.x - 50) * 0.5;
    }
  } else {
    const attacking = poss === side;
    const spread = (0.7 + t.width / 400) * (attacking ? 1 : 0.85);
    if (gk) {
      u = Math.min(14, 3 + Math.max(0, bu - 30) * 0.12);
      v = 50 + (bv - 50) * 0.18;
    } else {
      let back: number;
      let span: number;
      if (attacking) {
        back = Math.min(52, Math.max(14, bu - 40));
        span = 50;
      } else {
        back = Math.min(44, Math.max(7, bu - 20));
        span = 33;
        if (t.defence === "high_press") back += 5;
        if (t.defence === "deep_block") back -= 5;
      }
      back += (t.line - 50) * 0.1;
      u = back + ((slot.y - 18) / 68) * span;
      // Forwards make runs once the ball is in the last third.
      if (attacking && bu > 62 && slot.y >= 58) u += 5;
      u = Math.min(attacking ? 95 : 90, Math.max(4, u));
      v = 50 + (slot.x - 50) * spread + (bv - 50) * (attacking ? 0.15 : 0.3);
    }
  }
  v = Math.min(97, Math.max(3, v));
  return side === 0 ? { x: u, y: v } : { x: 100 - u, y: 100 - v };
}
