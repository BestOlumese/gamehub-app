// The live 2D viewer's frames (design decision, Oct 2026: all 22 players as dots, the ball going
// to whoever is on it, teams pushing up and dropping back, a goal banner). Pure: a frame comes
// from the events already shown (`playback.ts`) and the time, never from the live state ahead.
//
// Pitch coordinates: x 0 (left goal line) → 100 (right), y 0 (top touchline) → 100 (bottom).
// Home (side 0) attacks right, away attacks left, both halves.
import { formation, type MatchEvent, type Tactics, type TeamSheet } from "@gamehub/engine/football";
import type { Timed } from "./playback";

type Side = 0 | 1;
export type Dot = { id: string; side: Side; x: number; y: number; gk: boolean };
export type Frame = {
  dots: Dot[];
  ball: { x: number; y: number };
  /** Who's on the ball (their name shows under it). */
  carrier: string | null;
  /** "GOAL · Osimhen 34'" over the pitch for a moment. */
  banner: { player: string; m: number; side: Side } | null;
  /** A booking or a sending-off: that player's dot rings in the card's colour. */
  card: { id: string; colour: "yellow" | "red" } | null;
};

export const GOAL_MS = 2200;
const CARD_MS = 1800;
const SHOT_FLIGHT_MS = 350;

/** Events that say where the ball is (the rest are layered on top). */
const PLACES = new Set([
  "ball",
  "chance",
  "shot",
  "goal",
  "save",
  "corner",
  "free_kick",
  "offside",
  "pen",
  "kickoff",
  "et_start",
  "half_time",
  "full_time",
  "et_half",
  "et_end",
]);
const RESTART = new Set(["kickoff", "et_start", "half_time", "full_time", "et_half", "et_end"]);

/**
 * The frame at `now`. `kick`: both sheets at kickoff (tactics start there); `now`: both sheets
 * as the server has them (formation and slot order; can be up to 3 minutes ahead, so subs and
 * sendings-off still to be shown are undone here).
 */
export function frameAt(
  timed: readonly Timed[],
  at: number,
  kick: readonly [TeamSheet, TeamSheet],
  current: readonly [TeamSheet, TeamSheet],
): Frame {
  const shownCount = timed.findIndex((t) => t.at > at);
  const shown = (shownCount < 0 ? timed : timed.slice(0, shownCount)).map((t) => t.e);
  const later = shownCount < 0 ? [] : timed.slice(shownCount).map((t) => t.e);
  const lastAt = (shownCount < 0 ? timed : timed.slice(0, shownCount)).map((t) => t.at);

  // Line-ups: the current sheets with subs not yet shown undone (latest first).
  const ids = current.map((s) => s.xi.map((x) => x.id)) as [string[], string[]];
  for (const e of [...later].reverse())
    if (e.t === "sub") {
      const list = ids[e.team];
      const i = list.indexOf(e.on);
      if (i >= 0) list[i] = e.off;
    }
  // Sent off: gone once their card has had its moment on screen.
  const off = new Set(
    shown.flatMap((e, i) =>
      e.t === "foul" &&
      (e.card === "red" || e.card === "second_yellow") &&
      at - (lastAt[i] ?? 0) > CARD_MS
        ? [e.player]
        : [],
    ),
  );
  // Tactics as shown: kickoff's, then each "tactics" line.
  const tactics: [Tactics, Tactics] = [kick[0].tactics, kick[1].tactics];
  for (const e of shown) if (e.t === "tactics") tactics[e.team] = e.tactics;

  // Where the ball is: the latest placing event.
  let pi = -1;
  for (let i = shown.length - 1; i >= 0; i--)
    if (PLACES.has((shown[i] as MatchEvent).t)) {
      pi = i;
      break;
    }
  const place = pi >= 0 ? (shown[pi] as MatchEvent) : null;
  const since = pi >= 0 ? at - (lastAt[pi] ?? at) : 0;
  // The minute's zone and who has it, from the latest "ball" event.
  let poss: Side = 0;
  let zone: 0 | 1 | 2 = 1;
  for (let i = (pi < 0 ? shown.length : pi + 1) - 1; i >= 0; i--) {
    const e = shown[i] as MatchEvent;
    if (e.t === "ball") {
      poss = e.team;
      zone = e.zone;
      break;
    }
  }
  let kickoff = !place || RESTART.has(place.t);
  if (place && "team" in place && place.t !== "ball") {
    // Attacking moments: the attacking side in its final third. A save's team is the keeper's.
    poss = place.t === "save" ? ((1 - place.team) as Side) : place.team;
    if (place.t !== "free_kick" && place.t !== "offside") zone = 2;
  }
  if (place?.t === "goal" && since >= GOAL_MS) kickoff = true;

  // Each side's block: where its back line sits (from its own goal) and how long it is.
  const dots: Dot[] = [];
  const pos = new Map<string, { x: number; y: number }>();
  ([0, 1] as const).forEach((side) => {
    const slots = formation(current[side].formation).slots;
    const t = tactics[side];
    const attacking = side === poss;
    let back: number;
    let span: number;
    if (kickoff) {
      back = 20;
      span = 26;
    } else if (attacking) {
      back = [22, 34, 46][zone] as number;
      span = 48;
    } else {
      back = [38, 26, 13][zone] as number;
      span = 36;
      if (t.defence === "deep_block") back -= 5;
      if (t.defence === "high_press") back += 6;
    }
    back += (t.line - 50) * 0.12;
    const spread = (0.72 + t.width / 400) * (attacking ? 1 : 0.88);
    slots.forEach((s, i) => {
      const id = ids[side][i];
      if (!id || off.has(id)) return;
      const gk = s.pos === "GK";
      const u = gk
        ? attacking && zone === 2 && !kickoff
          ? 8
          : 4
        : Math.min(kickoff ? 48 : 94, Math.max(6, back + ((s.y - 18) / 68) * span));
      const v = 50 + (s.x - 50) * (gk ? 0 : spread);
      const x = side === 0 ? u : 100 - u;
      const y = side === 0 ? v : 100 - v;
      dots.push({ id, side, x, y, gk });
      pos.set(id, { x, y });
    });
  });

  // The ball and who has it.
  const toward = (side: Side, d: number) => (side === 0 ? d : -d);
  const goalX = (attackingSide: Side) => (attackingSide === 0 ? 101 : -1);
  let ball = { x: 50, y: 50 };
  let carrier: string | null = null;
  let banner: Frame["banner"] = null;
  const at_ = (id: string | undefined) => (id ? pos.get(id) : undefined);
  if (place && !kickoff) {
    const m = place.m;
    switch (place.t) {
      case "ball": {
        // Someone of theirs in that third, chosen by the minute (same every replay).
        const slots = formation(current[poss].formation).slots;
        const band = (y: number) =>
          zone === 0 ? y < 40 : zone === 1 ? y >= 34 && y <= 66 : y >= 58;
        const ids_ = slots.flatMap((s, i) => {
          const id = ids[poss][i];
          return id && s.pos !== "GK" && band(s.y) && !off.has(id) ? [id] : [];
        });
        carrier = ids_[(m * 7) % Math.max(1, ids_.length)] ?? null;
        break;
      }
      case "chance":
      case "offside":
      case "free_kick":
        carrier = place.player ?? null;
        break;
      case "shot": {
        carrier = place.player;
        if (since >= SHOT_FLIGHT_MS) {
          const p = at_(place.player);
          if (place.result === "goal") ball = { x: goalX(place.team), y: 50 };
          else if (place.result === "saved") {
            const keeper = dots.find((d) => d.gk && d.side !== place.team);
            if (keeper) ball = { x: keeper.x + toward(place.team, -1.5), y: keeper.y };
          } else if (place.result === "blocked" && p)
            ball = { x: p.x + toward(place.team, 4), y: p.y };
          else
            ball = {
              x: goalX(place.team),
              y: (m % 2 ? 38 : 62) + (place.result === "post" ? 4 : 0),
            };
          carrier = null;
        }
        break;
      }
      case "goal":
        ball = { x: goalX(place.team), y: 46 + (m % 3) * 4 };
        banner = { player: place.player, m, side: place.team };
        break;
      case "save":
        carrier = place.keeper;
        break;
      case "corner": {
        ball = { x: place.team === 0 ? 99 : 1, y: m % 2 ? 2 : 98 };
        if (place.player) {
          const d = dots.find((x) => x.id === place.player);
          if (d) {
            d.x = ball.x;
            d.y = ball.y;
          }
          carrier = place.player;
        }
        break;
      }
      case "pen":
        ball = { x: place.team === 0 ? 89 : 11, y: 50 };
        carrier = place.taker;
        break;
    }
    if (carrier && place.t !== "corner") {
      const p = at_(carrier);
      if (p) ball = { x: p.x + toward(poss, 1.6), y: p.y + 1.2 };
      else carrier = null;
    }
  }

  // A card: the latest foul with one, for a moment.
  let card: Frame["card"] = null;
  for (let i = shown.length - 1; i >= 0; i--) {
    const e = shown[i] as MatchEvent;
    if (at - (lastAt[i] ?? 0) > CARD_MS) break;
    if (e.t === "foul" && e.card) {
      card = { id: e.player, colour: e.card === "yellow" ? "yellow" : "red" };
      break;
    }
  }
  return { dots, ball, carrier, banner, card };
}
