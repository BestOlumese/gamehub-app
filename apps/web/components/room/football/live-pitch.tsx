"use client";

import { formation, type Card, type TeamSheet } from "@gamehub/engine/football";
import { useEffect, useMemo, useRef } from "react";
import {
  cardAt,
  celebrationMs,
  hash,
  latest,
  leavingAt,
  lineupAt,
  PEN_SPOT,
  planPlay,
  shapeSpot,
  tacticsAt,
  type Beat,
  type Lineup,
  type Mode,
  type Pt,
  type Side,
} from "./live-play";
import type { Timed } from "./playback";

/** Stripes across the pitch's length (it lies sideways here). */
const GRASS_SIDEWAYS =
  "repeating-linear-gradient(to right, #2E7D4F 0 8.333%, #2A744A 8.333% 16.666%)";

/** Metres per pitch unit, along and across (105 × 68). */
const MX = 1.05;
const MY = 0.68;
/** Top speeds in "game" metres a second at the default playback; scaled with the room's speed. */
const SPEED = { walk: 5, jog: 9, run: 14, sprint: 20 } as const;
type Pace = keyof typeof SPEED;
/** The default half (40 s) gives this many ms per match minute. */
const DEFAULT_MINUTE = 40_000 / 45;

type Player = {
  id: string;
  side: Side;
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  pace: Pace;
  /** When this player next looks up (each reacts on his own clock). */
  think: number;
  react: number;
  /** A slow personal drift so nobody stands like a statue. */
  f1: number;
  f2: number;
  p1: number;
  p2: number;
  placed: boolean;
};
type Flight = {
  from: Pt;
  to: Pt;
  t0: number;
  t1: number;
  loft: boolean;
  fast: boolean;
  /** Who has it when it lands. */
  then: string | null;
  /** Sideways curve as a share of the distance (+ bends one way, − the other). */
  bend?: number;
  /** Peak height for a ball in the air (1 ≈ a normal lofted pass). */
  lift?: number;
};

/** Where a flight is at progress `u`: a gently curved path, slowing on the grass, arcing in the air. */
function along(f: Flight, u: number): { x: number; y: number; h: number } {
  // Along the ground the ball slows as it rolls; in the air it keeps its pace; shots barely slow.
  const e = f.loft ? u : f.fast ? 1 - Math.pow(1 - u, 1.4) : 1 - Math.pow(1 - u, 2.2);
  const dx = f.to.x - f.from.x;
  const dy = f.to.y - f.from.y;
  const len = Math.hypot(dx, dy) || 1;
  // A quadratic curve through a control point pushed sideways from the middle.
  const bend = (f.bend ?? 0) * len;
  const cx = f.from.x + dx / 2 + (-dy / len) * bend;
  const cy = f.from.y + dy / 2 + (dx / len) * bend;
  const a = (1 - e) * (1 - e);
  const b = 2 * (1 - e) * e;
  const c = e * e;
  return {
    x: a * f.from.x + b * cx + c * f.to.x,
    y: a * f.from.y + b * cy + c * f.to.y,
    h: f.loft ? 4 * u * (1 - u) * (f.lift ?? 1) : 0,
  };
}
type Ball = Pt & {
  h: number;
  hold: string | null;
  flight: Flight | null;
  still: number;
  beat: Beat | null;
  kicked: boolean;
  dive: number | null;
};

/**
 * The live 2D viewer (design decisions, Oct 2026). `live-play.ts` plans the ball's journey from
 * the match events; this moves 22 players towards their places in the shape, each reacting on
 * his own clock with real acceleration, the nearest defender pressing, receivers running onto
 * passes, the man on the ball dribbling. Positions are written straight to the DOM each frame
 * (no React render per frame). Decorative: the commentary carries the same moments for screen
 * readers.
 */
export function LivePitch({
  timed,
  now,
  offset,
  kick,
  current,
  cards,
  colours,
  perMinute,
  mySide,
  fit,
}: {
  /** Your side in this match (stamina markers go on your players only). */
  mySide: Side | null;
  /** Your players' stamina (0–100). */
  fit: Record<string, number> | null;
  timed: readonly Timed[];
  now: number;
  offset: number;
  kick: readonly [TeamSheet, TeamSheet];
  current: readonly [TeamSheet, TeamSheet];
  cards: Record<string, Card>;
  colours: readonly [string, string];
  perMinute: number;
}) {
  const plan = useMemo(() => planPlay(timed, current, perMinute), [timed, current, perMinute]);
  const lineup = lineupAt(timed, current, now);
  const tactics = tacticsAt(timed, kick, now);
  const card = cardAt(timed, now);
  const leaving = leavingAt(timed, now);
  const sentOff = [...leaving].at(-1);
  const players = lineup.ids.flatMap((list, side) =>
    list.flatMap((id, slot) => (id ? [{ id, side: side as Side, slot }] : [])),
  );
  const keeperSlot = (side: Side) =>
    formation(lineup.formation[side]).slots.findIndex((s) => s.pos === "GK");

  // Banners: a goal for its celebration; a shoot-out kick just after it's taken.
  const goal = timed.findLast(
    (t) => t.e.t === "goal" && t.at <= now && now - t.at < celebrationMs(perMinute),
  )?.e;
  const lastGoal = timed.findLast((t) => t.e.t === "goal" && t.at <= now)?.e;
  const pen = plan.beats.findLast(
    (b): b is Extract<Beat, { k: "pen" }> =>
      b.k === "pen" && now >= b.kick + 260 && now - b.kick < 1260,
  );
  const name = (id: string | undefined) => (id ? (cards[id]?.short ?? "") : "");
  const banner = goal?.t === "goal" ? `GOAL · ${name(goal.player)} ${goal.m}'` : null;
  const lastText = lastGoal?.t === "goal" ? `GOAL · ${name(lastGoal.player)} ${lastGoal.m}'` : "";
  // Shoot-out kicks: a small pill at the top, so the players in the centre circle stay visible.
  const penText = pen
    ? pen.result === "scored"
      ? `Scored · ${name(pen.taker)}`
      : `Saved by ${name(pen.keeper)}`
    : null;

  const input = useRef({ plan, lineup, tactics, offset, perMinute, cards, leaving });
  useEffect(() => {
    input.current = { plan, lineup, tactics, offset, perMinute, cards, leaving };
  });

  const boxRef = useRef<HTMLDivElement>(null);
  const dotEls = useRef(new Map<string, HTMLSpanElement>());
  const ballEl = useRef<HTMLSpanElement>(null);
  const shadowEl = useRef<HTMLSpanElement>(null);
  const labelEl = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ps = new Map<string, Player>();
    const ball: Ball = {
      x: 50,
      y: 50,
      h: 0,
      hold: null,
      flight: null,
      still: 0,
      beat: null,
      kicked: false,
      dive: null,
    };
    let cornerTaker: string | null = null;
    /** Who's pressing, kept from frame to frame so two defenders don't keep swapping. */
    let pressing: string[] = [];
    let raf = 0;
    let last = performance.now();

    const slotOf = (line: Lineup, p: Player) =>
      formation(line.formation[p.side]).slots[p.slot] ?? { pos: "CM" as const, x: 50, y: 50 };
    const keeperId = (line: Lineup, side: Side) => {
      const i = formation(line.formation[side]).slots.findIndex((s) => s.pos === "GK");
      return line.ids[side][i] ?? null;
    };
    const possession = (): Side | null => {
      const id = ball.flight?.then ?? ball.hold;
      return id ? (ps.get(id)?.side ?? null) : null;
    };

    function begin(beat: Beat | null, now: number, line: Lineup) {
      ball.kicked = false;
      ball.dive = null;
      const from = { x: ball.x, y: ball.y };
      if (!beat || beat.k === "reset") {
        cornerTaker = null;
        ball.hold = null;
        // The ball is played back to the centre spot.
        ball.flight =
          Math.hypot(ball.x - 50, ball.y - 50) > 1
            ? {
                from,
                to: { x: 50, y: 50 },
                t0: now,
                t1: now + 700,
                loft: true,
                fast: false,
                then: null,
              }
            : null;
        return;
      }
      switch (beat.k) {
        case "pass": {
          const p = ps.get(beat.to);
          // Played into the space the receiver is running into.
          const to = p
            ? {
                x: (p.x + p.tx) / 2 + (p.side === 0 ? 1.5 : -1.5),
                y: (p.y + p.ty) / 2,
              }
            : { x: ball.x, y: ball.y };
          const dist = Math.hypot(to.x - from.x, to.y - from.y);
          const way = hash(`${beat.at}`) % 2 ? 1 : -1;
          ball.flight = {
            from,
            to,
            t0: beat.at,
            t1: beat.at + beat.dur,
            loft: beat.loft,
            fast: false,
            then: beat.to,
            // Long balls and crosses bend and hang; a ground pass only curls a little.
            bend: way * (beat.loft ? 0.1 : 0.03),
            lift: beat.loft ? Math.min(1.5, Math.max(0.6, dist / 28)) : 0,
          };
          ball.hold = null;
          break;
        }
        case "hold":
          ball.hold = beat.player;
          ball.flight = null;
          break;
        case "stop":
          ball.still = now + 500;
          break;
        case "shot": {
          const right = beat.side === 0;
          const keeper = keeperId(line, (1 - beat.side) as Side);
          const kp = keeper ? ps.get(keeper) : undefined;
          const to =
            beat.result === "goal"
              ? { x: right ? 100.8 : -0.8, y: beat.y }
              : beat.result === "wide"
                ? { x: right ? 102 : -2, y: beat.y }
                : beat.result === "post"
                  ? { x: right ? 99.4 : 0.6, y: beat.y }
                  : beat.result === "keeper" && kp
                    ? { x: kp.x + (right ? -0.8 : 0.8), y: (kp.y + beat.y) / 2 }
                    : { x: ball.x + (right ? 6 : -6), y: ball.y + 2 };
          if (beat.result === "keeper") ball.dive = to.y;
          ball.flight = {
            from,
            to,
            t0: beat.at,
            t1: beat.at + beat.dur,
            loft: beat.result === "wide" && hash(`${beat.at}`) % 2 === 0,
            fast: true,
            then: beat.result === "keeper" ? keeper : null,
          };
          ball.hold = null;
          break;
        }
        case "corner":
          // Out of play, then placed at the flag (no teleport).
          cornerTaker = beat.taker;
          ball.hold = null;
          ball.flight = {
            from,
            to: { x: beat.side === 0 ? 99.3 : 0.7, y: beat.y },
            t0: now,
            t1: now + 450,
            loft: false,
            fast: false,
            then: null,
          };
          break;
        case "celebrate":
          break;
        case "pen":
          // The ball is rolled back to the spot.
          ball.hold = null;
          ball.flight =
            Math.hypot(ball.x - PEN_SPOT.x, ball.y - PEN_SPOT.y) > 0.5
              ? { from, to: PEN_SPOT, t0: now, t1: now + 380, loft: false, fast: false, then: null }
              : null;
          break;
      }
    }

    function target(p: Player, now: number, line: Lineup, mode: Mode, boxSide: Side | null) {
      const { tactics } = input.current;
      const slot = slotOf(line, p);
      const gk = slot.pos === "GK";
      const beat = ball.beat;
      const dir = p.side === 0 ? 1 : -1;
      let pace: Pace = "jog";
      let t: Pt;
      if (mode === "pens" && beat?.k === "pen") {
        if (p.id === beat.taker && now < beat.kick + 300) {
          t = now < beat.kick - 380 ? { x: PEN_SPOT.x - 4, y: 50 } : { x: PEN_SPOT.x - 0.8, y: 50 };
          pace = "run";
        } else if (p.id === beat.nextTaker && now >= beat.kick) {
          // Next up: walks to the edge of the box while this one is settled.
          t = { x: PEN_SPOT.x - 6, y: 47 };
          pace = "run";
        } else if (p.id === beat.keeper) {
          t = { x: 98.8, y: now >= beat.kick && ball.dive !== null ? ball.dive : 50 };
          pace = now >= beat.kick ? "sprint" : "run";
        } else if (gk) {
          // The other keeper waits just beside the goal, to swap in quickly.
          t = { x: 95.5, y: p.side === 0 ? 30 : 70 };
          pace = "run";
        } else {
          // Everyone else arm in arm in the centre circle.
          t = { x: 36 + p.slot * 2.8, y: p.side === 0 ? 46 : 54 };
          pace = "walk";
        }
        return { t, pace, job: true };
      }
      if (mode === "celebrate" && beat?.k === "celebrate") {
        const scorer = ps.get(beat.scorer);
        if (p.id === beat.scorer)
          return { t: { x: p.side === 0 ? 95 : 5, y: beat.y }, pace: "sprint" as Pace, job: true };
        if (scorer && p.side === beat.side && !gk && hash(p.id) % 3 !== 0) {
          const a = (hash(p.id) % 360) * (Math.PI / 180);
          return {
            t: { x: scorer.x + Math.cos(a) * 2.5, y: scorer.y + Math.sin(a) * 3.5 },
            pace: "run" as Pace,
            job: true,
          };
        }
      }
      // Sent off: a slow walk to the nearest touchline.
      if (input.current.leaving.has(p.id))
        return { t: { x: p.x, y: p.y < 50 ? 1 : 99 }, pace: "walk" as Pace, job: true };
      const poss = possession();
      t = shapeSpot(p.side, slot, tactics[p.side], mode, ball, poss, boxSide);
      if (mode === "box" && p.id === cornerTaker && !ball.flight)
        return { t: { x: ball.x, y: ball.y }, pace: "run" as Pace, job: true };
      if (mode === "open" || mode === "box") {
        if (ball.flight?.then === p.id)
          return { t: ball.flight.to, pace: "sprint" as Pace, job: true };
        if (ball.hold === p.id && !ball.flight) {
          if (now < ball.still || gk)
            return { t: { x: p.x, y: p.y }, pace: "walk" as Pace, job: true };
          // Someone tight on him: he shields it instead of running into him.
          const tight = [...ps.values()].some(
            (o) => o.side !== p.side && Math.hypot((o.x - p.x) * MX, (o.y - p.y) * MY) < 3,
          );
          if (tight) return { t: { x: p.x - dir * 0.6, y: p.y }, pace: "walk" as Pace, job: true };
          // Dribble on, drifting a little infield.
          return {
            t: { x: p.x + dir * 6, y: p.y + (50 - p.y) * 0.08 },
            pace: "run" as Pace,
            job: true,
          };
        }
      }
      return { t, pace, job: false };
    }

    function step(dt: number) {
      const { plan, lineup: line, offset, perMinute } = input.current;
      const now = Date.now() + offset;
      const scale = Math.min(1.5, Math.max(0.6, DEFAULT_MINUTE / perMinute));
      const m = latest(plan.modes, now);
      const mode: Mode = m?.mode ?? "kickoff";
      const boxSide = m?.side ?? null;

      // Who's on: new players come on from the touchline (or appear in place at the start).
      const seen = new Set<string>();
      const first = ps.size === 0;
      line.ids.forEach((list, side) =>
        list.forEach((id, slot) => {
          if (!id) return;
          seen.add(id);
          let p = ps.get(id);
          if (!p) {
            const h = hash(id);
            p = {
              id,
              side: side as Side,
              slot,
              x: 50,
              y: 101,
              vx: 0,
              vy: 0,
              tx: 50,
              ty: 50,
              pace: "jog",
              think: 0,
              react: 160 + (h % 260),
              f1: 0.35 + (h % 7) * 0.06,
              f2: 0.27 + ((h >> 3) % 7) * 0.05,
              p1: (h % 628) / 100,
              p2: ((h >> 5) % 628) / 100,
              placed: !first,
            };
            ps.set(id, p);
          }
          p.side = side as Side;
          p.slot = slot;
        }),
      );
      for (const id of ps.keys()) if (!seen.has(id)) ps.delete(id);

      // The ball's script.
      const beat = latest(plan.beats, now);
      if (beat !== ball.beat) {
        begin(beat, now, line);
        ball.beat = beat;
      }
      if (beat?.k === "pen" && !ball.kicked && now >= beat.kick) {
        ball.kicked = true;
        const keeper = ps.get(beat.keeper);
        const to = beat.result === "scored" ? { x: 100.8, y: beat.y } : { x: 98.4, y: beat.y };
        // Scored: the keeper went the wrong way. Saved: he guessed right.
        ball.dive = beat.result === "scored" ? (beat.y < 50 ? 55.5 : 44.5) : beat.y;
        ball.flight = {
          from: { x: ball.x, y: ball.y },
          to,
          t0: beat.kick,
          t1: beat.kick + 260,
          loft: false,
          fast: true,
          then: beat.result === "saved" && keeper ? keeper.id : null,
        };
      }
      if (ball.flight) {
        const f = ball.flight;
        const u = reduce ? 1 : Math.min(1, Math.max(0, (now - f.t0) / Math.max(1, f.t1 - f.t0)));
        const at = along(f, u);
        ball.x = at.x;
        ball.y = at.y;
        ball.h = at.h;
        if (u >= 1) {
          ball.flight = null;
          ball.h = 0;
          if (f.then) ball.hold = f.then;
        }
      } else if (ball.hold) {
        const p = ps.get(ball.hold);
        if (!p) ball.hold = null;
        else {
          const k = reduce ? 1 : Math.min(1, dt * 12);
          ball.x += (p.x + (p.side === 0 ? 1.3 : -1.3) - ball.x) * k;
          ball.y += (p.y + 0.9 - ball.y) * k;
        }
      }

      // Pressing: the two nearest of the side without the ball close it down and cover.
      const poss = possession();
      const pressers: string[] = [];
      if (mode === "open" && poss !== null) {
        const dist = (p: Player) => Math.hypot((p.x - ball.x) * MX, (p.y - ball.y) * MY);
        const near = [...ps.values()]
          .filter(
            (p) =>
              p.side !== poss && slotOf(line, p).pos !== "GK" && !input.current.leaving.has(p.id),
          )
          .sort((a, b) => dist(a) - dist(b));
        // Keep the man already pressing unless someone is clearly closer (no swapping each frame).
        const was = pressing[0] ? ps.get(pressing[0]) : undefined;
        const first =
          was && was.side !== poss && near[0] && dist(was) < dist(near[0]) * 1.25 ? was : near[0];
        if (first) pressers.push(first.id);
        const second = near.find((p) => p.id !== first?.id);
        if (second) pressers.push(second.id);
      }
      pressing = pressers;

      for (const p of ps.values()) {
        const r = target(p, now, line, mode, boxSide);
        let pace = r.pace;
        let tx: number;
        let ty: number;
        const pi = pressers.indexOf(p.id);
        if (!r.job && pi >= 0) {
          const back = p.side === 0 ? -1 : 1;
          tx = ball.x + back * (pi === 0 ? 2 : 7);
          ty = ball.y + (50 - ball.y) * (pi === 0 ? 0.03 : 0.15);
          pace = pi === 0 ? "sprint" : "run";
        } else {
          tx = r.t.x;
          ty = r.t.y;
        }
        if (r.job || pi >= 0 || now >= p.think || !p.placed) {
          // Off the ball, each player only re-reads the game every few hundred ms.
          const sway = r.job || pi >= 0 ? 0 : 1;
          const s = now / 1000;
          p.tx = tx + Math.sin(s * p.f1 + p.p1) * 1.2 * sway;
          p.ty = ty + Math.cos(s * p.f2 + p.p2) * 1.6 * sway;
          p.pace = pace;
          p.think = now + p.react / scale;
        }
        if (!p.placed || reduce) {
          p.x = p.tx;
          p.y = p.ty;
          p.vx = 0;
          p.vy = 0;
          p.placed = true;
          continue;
        }
        // Steer: accelerate towards the target, ease off as you arrive.
        const dx = (p.tx - p.x) * MX;
        const dy = (p.ty - p.y) * MY;
        const d = Math.hypot(dx, dy);
        const top = SPEED[p.pace] * scale;
        const want = d < 0.05 ? 0 : Math.min(top, d * 2.6);
        const wx = d ? (dx / d) * want : 0;
        const wy = d ? (dy / d) * want : 0;
        const a = Math.min(1, dt * (p.pace === "sprint" ? 5 : 3.5));
        p.vx += (wx - p.vx) * a;
        p.vy += (wy - p.vy) * a;
        p.x += (p.vx * dt) / MX;
        p.y += (p.vy * dt) / MY;
      }
    }

    function draw() {
      const box = boxRef.current;
      if (!box) return;
      const W = box.clientWidth;
      const H = box.clientHeight;
      for (const [id, el] of dotEls.current) {
        const p = ps.get(id);
        if (!p) continue;
        el.style.transform = `translate3d(${(p.x / 100) * W}px, ${(p.y / 100) * H}px, 0) translate(-50%, -50%)`;
        el.style.outline = id === ball.hold ? "2px solid #fff" : "none";
      }
      const lift = ball.h * 5;
      if (ballEl.current)
        ballEl.current.style.transform = `translate3d(${(ball.x / 100) * W}px, ${((ball.y - lift) / 100) * H}px, 0) translate(-50%, -50%) scale(${1 + ball.h * 0.7})`;
      if (shadowEl.current) {
        shadowEl.current.style.transform = `translate3d(${(ball.x / 100) * W}px, ${(ball.y / 100) * H}px, 0) translate(-50%, -50%)`;
        shadowEl.current.style.opacity = String(0.35 - ball.h * 0.2);
      }
      const label = labelEl.current;
      if (label) {
        const p = ball.hold && !ball.flight ? ps.get(ball.hold) : undefined;
        if (p) {
          const text = input.current.cards[p.id]?.short ?? "";
          if (label.textContent !== text) label.textContent = text;
          const x = Math.min(0.88 * W, Math.max(0.12 * W, (p.x / 100) * W));
          label.style.transform = `translate3d(${x}px, ${(p.y / 100) * H + 9}px, 0) translate(-50%, 0)`;
          label.style.opacity = "1";
        } else label.style.opacity = "0";
      }
    }

    const frame = (t: number) => {
      const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
      last = t;
      step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hidden = "translate3d(-100px, -100px, 0)";
  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden rounded-card"
      style={{ aspectRatio: "16 / 10", background: GRASS_SIDEWAYS }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 160 100" className="absolute inset-0 size-full">
        <g
          fill="none"
          stroke="rgb(255 255 255 / 0.5)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        >
          <rect x="3" y="3" width="154" height="94" />
          <line x1="80" y1="3" x2="80" y2="97" />
          <circle cx="80" cy="50" r="12" />
          <rect x="3" y="27" width="22" height="46" />
          <rect x="135" y="27" width="22" height="46" />
          <rect x="3" y="40" width="8" height="20" />
          <rect x="149" y="40" width="8" height="20" />
          <circle cx="141.6" cy="50" r="0.6" fill="rgb(255 255 255 / 0.6)" />
          <circle cx="18.4" cy="50" r="0.6" fill="rgb(255 255 255 / 0.6)" />
        </g>
        {/* The goals: the one just scored in lights up. */}
        {[0, 1].map((side) => (
          <rect
            key={side}
            x={side === 0 ? 0.5 : 157}
            y="43"
            width="2.5"
            height="14"
            className="motion-safe:transition-[fill] motion-safe:duration-300"
            fill={
              goal?.t === "goal" && goal.team !== side
                ? "rgb(230 162 60 / 0.95)"
                : "rgb(255 255 255 / 0.8)"
            }
          />
        ))}
      </svg>

      {players.map((p) => {
        const gk = p.slot === keeperSlot(p.side);
        const off = leaving.has(p.id);
        const ring =
          off || (card?.id === p.id && card.colour === "red")
            ? "0 0 0 3px #D9473F"
            : card?.id === p.id
              ? "0 0 0 3px #F2C14E"
              : "none";
        // Your own players' legs: amber when tiring, red when spent.
        const legs = p.side === mySide && !gk ? fit?.[p.id] : undefined;
        const tired =
          legs === undefined ? null : legs < 40 ? "#D9473F" : legs < 55 ? "#F2C14E" : null;
        return (
          <span
            key={p.id}
            data-player={p.id}
            ref={(el) => {
              if (el) dotEls.current.set(p.id, el);
              else dotEls.current.delete(p.id);
            }}
            className="absolute top-0 left-0 aspect-square w-[3.4%] min-w-2.5 rounded-full border border-white/90 will-change-transform"
            style={{
              transform: hidden,
              background: colours[p.side],
              filter: gk ? "brightness(0.7)" : undefined,
              boxShadow: ring,
              outlineOffset: 1,
            }}
          >
            {off ? (
              <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded-sm bg-danger px-1 text-[9px] leading-3.5 font-bold whitespace-nowrap text-white">
                RED · {name(p.id)}
              </span>
            ) : null}
            {tired ? (
              <span
                className="absolute -top-1 -right-1 size-[45%] min-w-1.5 rounded-full border border-white"
                style={{ background: tired }}
              />
            ) : null}
          </span>
        );
      })}

      {/* The ball, its shadow on the grass, and who has it. */}
      <span
        ref={shadowEl}
        className="absolute top-0 left-0 aspect-[2/1] w-[2.6%] min-w-2 rounded-full bg-[rgb(0_0_0/0.6)]"
        style={{ transform: hidden }}
      />
      <span
        ref={ballEl}
        className="absolute top-0 left-0 z-20 aspect-square w-[2.4%] min-w-2 rounded-full border border-ink bg-white"
        style={{ transform: hidden }}
      />
      <span
        ref={labelEl}
        className="absolute top-0 left-0 z-20 rounded-full bg-[rgb(0_0_0/0.6)] px-1.5 text-[10px] leading-4 font-semibold whitespace-nowrap text-white"
        style={{ transform: hidden, opacity: 0 }}
      />

      {/* Goal banner. */}
      <div
        className={`absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 justify-center motion-safe:transition-[opacity,transform] motion-safe:duration-300 ${banner ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
      >
        <span className="rounded-full bg-accent px-4 py-1.5 font-display text-lg font-extrabold text-ink shadow-lg">
          {banner ?? lastText}
        </span>
      </div>
      {/* A sending-off. */}
      {sentOff && !penText ? (
        <div className="absolute inset-x-0 top-[6%] z-30 flex justify-center">
          <span className="rounded-full bg-danger px-3 py-0.5 text-sm font-bold text-white shadow">
            Red card · {name(sentOff)}
          </span>
        </div>
      ) : null}
      {/* Shoot-out result. */}
      {penText ? (
        <div className="absolute inset-x-0 top-[6%] z-30 flex justify-center">
          <span
            className={`rounded-full px-3 py-0.5 text-sm font-bold shadow ${pen?.result === "scored" ? "bg-accent text-ink" : "bg-surface text-ink"}`}
          >
            {penText}
          </span>
        </div>
      ) : null}
    </div>
  );
}
