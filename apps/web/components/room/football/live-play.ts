// The live 2D viewer's helpers: who's on the pitch at a moment (subs not yet shown undone,
// sent-off players gone once they've walked off), the tactics as shown, bookings, and where each
// player belongs in his side's shape given the ball. `live-sim.ts` builds on them.
//
// Shape coordinates: x 0 (left goal line) → 100 (right), y 0 (top touchline) → 100 (bottom).
// Home (side 0) attacks right, away attacks left.
import { type Position, type Tactics, type TeamSheet } from "@gamehub/engine/football";
import type { Timed } from "./playback";

export type Side = 0 | 1;
export type Pt = { x: number; y: number };

/** How long a booking rings on the player. */
export const CARD_MS = 1800;
/** A sent-off player's walk to the touchline. */
export const RED_OFF_MS = 3200;
export type Mode = "kickoff" | "open" | "box" | "celebrate" | "pens";
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
  cardGrace = RED_OFF_MS,
): Lineup {
  const ids = current.map((s) => s.xi.map((x) => x.id as string | null)) as Lineup["ids"];
  for (let i = timed.length - 1; i >= 0; i--) {
    const t = timed[i] as Timed;
    if (t.at <= at) continue;
    if (t.e.t === "sub") {
      const list = ids[t.e.team];
      const k = list.indexOf(t.e.on);
      if (k >= 0) list[k] = t.e.off;
    }
  }
  for (const t of timed) {
    if (t.at > at) continue;
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

/** The latest booking still ringing at `at` (a red one rings all the way off the pitch). */
export function cardAt(
  timed: readonly Timed[],
  at: number,
): { id: string; colour: "yellow" | "red" } | null {
  for (let i = timed.length - 1; i >= 0; i--) {
    const t = timed[i] as Timed;
    if (t.at > at) continue;
    if (at - t.at > RED_OFF_MS) break;
    if (t.e.t === "foul" && t.e.card) {
      const red = t.e.card !== "yellow";
      if (!red && at - t.at > CARD_MS) continue;
      return { id: t.e.player, colour: red ? "red" : "yellow" };
    }
  }
  return null;
}

/** Players sent off who are still walking to the touchline at `at`. */
export function leavingAt(timed: readonly Timed[], at: number): Set<string> {
  const out = new Set<string>();
  for (const t of timed)
    if (
      t.e.t === "foul" &&
      (t.e.card === "red" || t.e.card === "second_yellow") &&
      t.at <= at &&
      at - t.at <= RED_OFF_MS
    )
      out.add(t.e.player);
  return out;
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
