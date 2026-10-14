// The live 2D viewer's simulation (Best, Oct 2026: "dots move realistic, physics based").
// Real units: metres and seconds on a 105 × 68 pitch. The match engine decides what happens and
// writes each minute's build-up; the shared timeline (`timeline.ts`) says when, in sim seconds.
// This plays it: the ball is kicked and flies or rolls with real speeds, players steer with real
// pace and acceleration towards their place in the team's shape or their job (receive the pass,
// make the run, press, mark, dive). It never decides anything itself.
//
// Home (side 0) attacks towards x = 105; away towards x = 0. A shoot-out is at the x = 105 goal.
import {
  formation,
  isKeeperStats,
  type Card,
  type MatchEvent,
  type Tactics,
  type TeamSheet,
  type Timeline,
} from "@gamehub/engine/football";
import { hash, leavingAt, lineupAt, shapeSpot, tacticsAt, type Mode, type Side } from "./live-play";
import type { Timed } from "./playback";

export const W = 105;
export const H = 68;
const G = 9.81;
const STEP = 1 / 30;
const GOAL_Y = H / 2;
const POST = 3.66;

type V = { x: number; y: number };
const len = (x: number, y: number) => Math.hypot(x, y);

export type SimPlayer = {
  id: string;
  side: Side;
  slot: number;
  gk: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where he's heading, and how fast he may go there (m/s). */
  tx: number;
  ty: number;
  speed: number;
  /** Top speed from his pace (m/s) and the next time he re-reads the game (sim s). */
  vmax: number;
  think: number;
  /** A job overrides his place in the shape until this sim time. */
  job: { x: number; y: number; until: number; sprint: boolean } | null;
};

type Flight = {
  from: V;
  to: V;
  t0: number;
  t1: number;
  kind: "ground" | "air" | "shot";
  /** Peak height (m) for a ball in the air. */
  peak: number;
  /** Sideways curve (m at the middle). */
  bend: number;
  /** Who has it when it lands (or null: it stops there). */
  then: string | null;
};

export type SimBall = {
  x: number;
  y: number;
  z: number;
  owner: string | null;
  flight: Flight | null;
  /** Dead (a foul, offside, the ball in the net): it settles where it is. */
  dead: boolean;
};

type Action =
  | {
      s: number;
      k: "touch";
      id: string;
      how: string;
      arrive: number;
      team: Side;
      minute: number;
      /** Its place in the minute's build-up: index, count, an attack, the final ball. */
      idx: number;
      n: number;
      busy: boolean;
      final: boolean;
    }
  | { s: number; k: "shot"; id: string; team: Side; result: string; until: number }
  | { s: number; k: "goal"; team: Side; scorer: string }
  | { s: number; k: "save"; keeper: string }
  | { s: number; k: "corner"; team: Side; until: number }
  | { s: number; k: "dead" }
  /** A free kick in a good area: the ball is placed, the taker steps up (he shoots himself). */
  | { s: number; k: "freekick"; team: Side; taker: string; until: number; strike: number }
  | { s: number; k: "kickoff" }
  | { s: number; k: "half" };

export type SimFrame = {
  players: SimPlayer[];
  ball: SimBall;
  /** The man on the ball (for his name under it). */
  carrier: string | null;
  mode: Mode;
};

/** Each minute's sim start, and every scripted action at its global sim time. */
function compile(tl: Timeline, seg: readonly MatchEvent[]) {
  const starts: number[] = [];
  const actions: Action[] = [];
  let s = 0;
  const evAt = new Map<MatchEvent, number>();
  for (const x of tl.events) evAt.set(x.e, x.sim);
  tl.minutes.forEach((m, mi) => {
    starts.push(s);
    const ball = tl.events[m.ball]?.e;
    const team: Side = ball?.t === "ball" ? ball.team : 0;
    const lastPass = m.touches.findLastIndex((t) => t.how !== "d");
    m.touches.forEach((t, idx) =>
      actions.push({
        s: s + t.kick,
        k: "touch",
        id: t.id,
        how: t.how,
        arrive: s + t.arrive,
        team,
        minute: mi,
        idx,
        n: m.touches.length,
        busy: m.busy,
        final: m.busy && idx === lastPass && idx > 0,
      }),
    );
    // The minute's events, in order, at their sim times.
    const next = tl.minutes[mi + 1];
    const inside = tl.events.slice(m.ball + 1, next ? next.ball : undefined).map((x) => x.e);
    inside.forEach((e, n) => {
      const at = s + (evAt.get(e) ?? 0);
      const after = inside
        .slice(n + 1)
        .find((x) => x.t !== "tactics" && x.t !== "sub" && x.t !== "tired");
      const until = after ? s + (evAt.get(after) ?? 0) : s + m.sim;
      if (e.t === "shot")
        actions.push({
          s: at,
          k: "shot",
          id: e.player,
          team: e.team,
          result: e.result,
          until: Math.max(at + 0.25, until),
        });
      else if (e.t === "goal") actions.push({ s: at, k: "goal", team: e.team, scorer: e.player });
      else if (e.t === "save") actions.push({ s: at, k: "save", keeper: e.keeper });
      else if (e.t === "corner") actions.push({ s: at, k: "corner", team: e.team, until });
      else if (e.t === "foul" || e.t === "offside") actions.push({ s: at, k: "dead" });
      else if (e.t === "free_kick") {
        const taker = inside.slice(n + 1).find((x) => x.t === "chance");
        const shot = inside.slice(n + 1).find((x) => x.t === "shot");
        const strike = shot ? s + (evAt.get(shot) ?? 0) : until + 1;
        if (taker?.t === "chance")
          actions.push({ s: at, k: "freekick", team: e.team, taker: taker.player, until, strike });
      } else if (e.t === "chance" && e.kind === "corner")
        actions.push({
          s: at,
          k: "touch",
          id: e.player,
          how: "c",
          arrive: until,
          team: e.team,
          minute: mi,
          idx: 1,
          n: 2,
          busy: true,
          final: true,
        });
    });
    s += m.sim;
  });
  void seg;
  actions.sort((a, b) => a.s - b.s);
  return { starts, actions, total: s };
}

/** Top speed (m/s) from pace: 6 for a slow player, 8 for the quickest. */
function topSpeed(c: Card | undefined, gk: boolean, legs: number | undefined): number {
  if (gk || !c) return 6;
  const spd = isKeeperStats(c.stats) ? 60 : c.stats.spd;
  const base = 5.8 + Math.max(0, spd - 40) * 0.045;
  // Tired legs (only known for your own players).
  const tired = legs === undefined ? 1 : 0.82 + 0.18 * Math.min(1, Math.max(0, (legs - 30) / 50));
  return base * tired;
}

/**
 * The simulation. Feed it real time (`at`, server clock) and it advances the sim to the
 * timeline's sim time for that moment, in fixed steps.
 */
export class LiveSim {
  ps = new Map<string, SimPlayer>();
  ball: SimBall = { x: W / 2, y: GOAL_Y, z: 0, owner: null, flight: null, dead: false };
  private S = -1;
  private next = 0;
  private compiled: ReturnType<typeof compile> | null = null;
  private tl: Timeline | null = null;
  private mode: Mode = "kickoff";
  private poss: Side | null = null;
  private scorer: { id: string; side: Side; until: number } | null = null;
  private cornerTaker: { id: string; until: number } | null = null;
  private pressing: string | null = null;
  private attacking = false;
  /** The current move's reception points: who, where, when the ball gets there. */
  private plan: Array<V & { id: string; s: number; at: number; minute: number }> = [];

  /** Plans every reception of minute `mi` now (each from where the man is, in his time). */
  private planMove(mi: number) {
    this.plan = [];
    const acts = (this.compiled as ReturnType<typeof compile>).actions;
    for (const x of acts) {
      if (x.k !== "touch" || x.minute !== mi || x.how === "d") continue;
      const q = this.ps.get(x.id);
      if (!q) continue;
      // A man receiving twice starts his second run from his first spot; each pass is played
      // from where the man before took it (the first from where the ball is).
      const prior = this.plan.findLast((e) => e.id === x.id);
      const from = prior ? { ...q, x: prior.x, y: prior.y, vx: 0, vy: 0 } : q;
      const passer = this.plan.at(-1) ?? { x: this.ball.x, y: this.ball.y };
      const spot = this.receptionSpot(x, from, prior ? x.arrive - prior.at : undefined, passer);
      this.plan.push({ ...spot, id: x.id, s: x.s, at: x.arrive, minute: mi });
    }
  }
  /** Owners who have actually reached the ball (cleared when it's played on). */
  private held = new Set<string>();

  /**
   * Where a pass meets its man. In an attack each pass lands further forward and the final ball
   * in shooting range for its kind; in a quiet minute, where he's heading in the shape.
   */
  private receptionSpot(
    a: Extract<Action, { k: "touch" }>,
    p: SimPlayer,
    time: number | undefined,
    passer: V,
  ): V {
    const want = this.idealSpot(a, p, passer);
    // Only as far as a real player gets in the time he has, so the pass and the man arrive
    // together: from his speed along the way (turning first if he's going the other way),
    // about 4 m/s² up to his top speed.
    const T = Math.max(0.2, time ?? a.arrive - this.S);
    const d = len(want.x - p.x, want.y - p.y);
    let v = d ? (p.vx * (want.x - p.x) + p.vy * (want.y - p.y)) / d : 0;
    let covered = 0;
    for (let t = 0; t < T; t += 0.05) {
      v = Math.min(p.vmax, v + (v < 0 ? 6 : 4) * 0.05);
      covered += v * 0.05;
    }
    const reach = Math.max(0, covered * 0.85);
    const spot =
      d <= reach
        ? want
        : { x: p.x + ((want.x - p.x) * reach) / d, y: p.y + ((want.y - p.y) * reach) / d };
    // And no further than the ball can go in its travel time: a hard ground pass leaves the
    // foot at about 18 m/s (22 in behind) and slows by about 7 m/s²; in the air about 26 m/s.
    const flight = Math.max(0.2, a.arrive - a.s);
    const air = a.how === "l" || a.how === "c";
    const v0 = a.how === "t" ? 22 : a.how === "g" ? 20 : 18;
    const ballReach = air
      ? 26 * flight
      : Math.min(v0 * flight - 3.5 * flight * flight, (v0 * v0 - 4) / 14);
    const bd = len(spot.x - passer.x, spot.y - passer.y);
    return bd <= ballReach
      ? spot
      : {
          x: passer.x + ((spot.x - passer.x) * ballReach) / bd,
          y: passer.y + ((spot.y - passer.y) * ballReach) / bd,
        };
  }

  private idealSpot(a: Extract<Action, { k: "touch" }>, p: SimPlayer, passer: V): V {
    // Won back: he picks up the loose ball near where it was.
    if (a.how === "w") return passer;
    const h = hash(`${a.id}${a.minute}${a.idx}`);
    const gx = a.team === 0 ? W : 0;
    const dir = a.team === 0 ? 1 : -1;
    const lane = (spread: number) => GOAL_Y + (p.y - GOAL_Y) * spread;
    if (a.final) {
      if (a.how === "c") return boxSpot(p, a.team, h);
      const depth = a.how === "t" ? 11 + (h % 5) : a.how === "l" ? 14 + (h % 6) : 15 + (h % 6);
      return { x: gx - dir * depth, y: Math.min(H - 8, Math.max(8, lane(0.35) + ((h % 7) - 3))) };
    }
    if (a.busy) {
      // Building up: each pass takes it forward from where it was played (a long ball further),
      // never closer than about 14 m before the final ball.
      const step = a.how === "l" ? 30 : a.how === "t" ? 16 : a.how === "g" ? 18 : 12 + (h % 4);
      const x = passer.x + dir * step;
      const limit = gx - dir * 14;
      return {
        x: dir > 0 ? Math.min(limit, x) : Math.max(limit, x),
        y: Math.min(H - 3, Math.max(3, (lane(0.85) + passer.y) / 2 + ((h % 9) - 4))),
      };
    }
    return { x: (p.x + p.tx) / 2, y: (p.y + p.ty) / 2 };
  }

  /** Global sim time for real time `at` on this timeline. */
  simTime(tl: Timeline, at: number): number {
    const c = this.compiled as ReturnType<typeof compile>;
    let lo = 0;
    let hi = tl.minutes.length - 1;
    let i = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((tl.minutes[mid] as { start: number }).start <= at) {
        i = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (i < 0) return 0;
    const m = tl.minutes[i] as Timeline["minutes"][number];
    const real = Math.max(0, at - m.start) / 1000;
    const cutReal = m.cut / m.ff;
    const inside = Math.min(
      m.sim,
      real <= cutReal ? real * m.ff : m.cut + (real - cutReal) * m.scale,
    );
    return (c.starts[i] ?? 0) + inside;
  }

  /** Advance to real time `at`. */
  update(
    at: number,
    o: {
      tl: Timeline;
      timed: readonly Timed[];
      kick: readonly [TeamSheet, TeamSheet];
      current: readonly [TeamSheet, TeamSheet];
      cards: Record<string, Card>;
      fit: Record<string, number> | null;
      mySide: Side | null;
      reduce: boolean;
    },
  ): SimFrame {
    if (o.tl !== this.tl) {
      const seg = o.tl.events.map((x) => x.e);
      this.compiled = compile(o.tl, seg);
      // A new timeline only adds minutes at the end; restart the action cursor safely.
      this.next = 0;
      while (
        this.next < this.compiled.actions.length &&
        (this.compiled.actions[this.next] as Action).s <= this.S
      )
        this.next++;
      this.tl = o.tl;
    }
    this.roster(at, o);
    if (!o.tl.minutes.length && o.tl.events.some((x) => x.e.t === "pen")) return this.pens(at, o);
    const S = this.simTime(o.tl, at);
    const tactics = tacticsAt(o.timed, o.kick, at);
    const leaving = leavingAt(o.timed, at);
    if (this.S < 0 || S < this.S - 0.01 || S - this.S > 40 || o.reduce) {
      // First frame, a rewind, or a long gap (tab in the background): jump straight there.
      this.S = S;
      this.catchUp(S, tactics, leaving, o);
      this.place(tactics, leaving, o);
      return this.frame();
    }
    // Fixed steps; fast-forward takes bigger ones (at most eight a frame).
    const step = Math.min(0.25, Math.max(STEP, (S - this.S) / 8));
    while (this.S + step <= S + 1e-9) {
      this.S += step;
      this.fire(this.S, o);
      this.think(this.S, tactics, leaving, o);
      this.move(step);
      this.moveBall(this.S, step);
    }
    return this.frame();
  }

  private frame(): SimFrame {
    // Nobody is "on the ball" while it flies or while play is stopped.
    const carrier = this.ball.flight || this.ball.dead ? null : this.ball.owner;
    return { players: [...this.ps.values()], ball: this.ball, carrier, mode: this.mode };
  }

  /** Who's on: spawn newcomers (from the touchline mid-match), drop who's gone. */
  private roster(at: number, o: Parameters<LiveSim["update"]>[1]) {
    const line = lineupAt(o.timed, o.current, at);
    const seen = new Set<string>();
    const first = this.ps.size === 0;
    line.ids.forEach((list, side) =>
      list.forEach((id, slot) => {
        if (!id) return;
        seen.add(id);
        const slots = formation(line.formation[side as Side]).slots;
        const gk = slots[slot]?.pos === "GK";
        let p = this.ps.get(id);
        if (!p) {
          const h = hash(id);
          p = {
            id,
            side: side as Side,
            slot,
            gk,
            x: first ? W / 2 : W / 2 + (side ? 3 : -3),
            y: first ? GOAL_Y : H + 1,
            vx: 0,
            vy: 0,
            tx: W / 2,
            ty: GOAL_Y,
            speed: 3,
            vmax: 6,
            think: (h % 250) / 1000,
            job: null,
          };
          this.ps.set(id, p);
        }
        p.side = side as Side;
        p.slot = slot;
        p.gk = gk;
        p.vmax = topSpeed(o.cards[id], gk, side === o.mySide ? o.fit?.[id] : undefined);
      }),
    );
    for (const id of this.ps.keys()) if (!seen.has(id)) this.ps.delete(id);
  }

  /** Apply every action up to sim time `S`. */
  private fire(S: number, o: Parameters<LiveSim["update"]>[1]) {
    const acts = (this.compiled as ReturnType<typeof compile>).actions;
    while (this.next < acts.length && (acts[this.next] as Action).s <= S) {
      const a = acts[this.next] as Action;
      this.next++;
      this.apply(a, S, o);
    }
  }

  private keeperOf(side: Side) {
    return [...this.ps.values()].find((p) => p.side === side && p.gk);
  }

  private apply(a: Action, S: number, o: Parameters<LiveSim["update"]>[1]) {
    const b = this.ball;
    const from = { x: b.x, y: b.y };
    switch (a.k) {
      case "touch": {
        const p = this.ps.get(a.id);
        if (!p) return;
        this.mode = "open";
        this.poss = a.team;
        this.attacking = a.busy;
        b.dead = false;
        if (a.how === "k") {
          // Kickoff: the ball on the spot.
          b.x = W / 2;
          b.y = GOAL_Y;
          b.z = 0;
        }
        if (a.how === "d") {
          // He carries it: he runs with it, the ball at his feet.
          b.owner = a.id;
          b.flight = null;
          const dir = a.team === 0 ? 1 : -1;
          const gx = a.team === 0 ? W : 0;
          // In an attack he carries it towards goal (a long shot stops about 22 m out).
          const x = a.busy ? gx - dir * Math.max(20, Math.abs(gx - p.x) - 12) : p.x + dir * 8;
          p.job = {
            x: clampX(x),
            y: p.y + (GOAL_Y - p.y) * (a.busy ? 0.4 : 0.15),
            until: a.arrive,
            sprint: true,
          };
          return;
        }
        // The whole move is planned when it starts: every receiver gets all the time until his
        // ball comes to make his run (a man who receives twice runs to his next one after).
        if (!this.plan.some((e) => e.minute === a.minute)) this.planMove(a.minute);
        const mine = this.plan.find((e) => e.s === a.s);
        const to = mine ?? this.receptionSpot(a, p, undefined, from);
        if (!mine) this.plan.push({ ...to, id: a.id, s: a.s, at: a.arrive, minute: a.minute });
        const T = Math.max(0.2, a.arrive - S);
        const air = a.how === "l" || a.how === "c";
        const dist = len(to.x - from.x, to.y - from.y);
        b.flight = {
          from,
          to,
          t0: S,
          t1: a.arrive,
          kind: air ? "air" : "ground",
          peak: air ? Math.min(12, Math.max(1.5, (G * T * T) / 8)) : 0,
          bend: (hash(`${a.id}${S}`) % 2 ? 1 : -1) * dist * (a.how === "c" ? 0.08 : 0.03),
          then: a.id,
        };
        b.owner = null;
        this.held.clear();
        return;
      }
      case "shot": {
        const right = a.team === 0;
        const gx = right ? W : 0;
        const k = this.keeperOf((1 - a.team) as Side);
        const aim = GOAL_Y + ((hash(`${a.id}${S}`) % 5) - 2) * 1.3;
        let to: V;
        let peak = 0.6;
        let then: string | null = null;
        switch (a.result) {
          case "goal":
            to = { x: gx + (right ? 1.2 : -1.2), y: aim };
            break;
          case "saved":
            to = k ? { x: k.x + (right ? 0.6 : -0.6), y: aim } : { x: gx, y: aim };
            then = k?.id ?? null;
            if (k) k.job = { x: k.x, y: aim, until: a.until + 0.5, sprint: true };
            break;
          case "post":
            to = { x: gx, y: GOAL_Y + (aim >= GOAL_Y ? POST : -POST) };
            break;
          case "blocked": {
            // Into the nearest defender in the way.
            const def = [...this.ps.values()]
              .filter((p) => p.side !== a.team && !p.gk)
              .sort((p, q) => len(p.x - b.x, p.y - b.y) - len(q.x - b.x, q.y - b.y))[0];
            to = def ? { x: def.x, y: def.y } : { x: b.x + (right ? 4 : -4), y: b.y };
            peak = 0.2;
            break;
          }
          default:
            // Wide or over.
            to = {
              x: gx + (right ? 2 : -2),
              y: GOAL_Y + (hash(`${S}`) % 2 ? 1 : -1) * (POST + 2 + (hash(a.id) % 4)),
            };
            peak = hash(`${a.id}`) % 2 ? 2.8 : 0.8;
        }
        b.flight = {
          from,
          to,
          t0: S,
          t1: Math.max(S + 0.25, Math.min(a.until, S + 1.2)),
          kind: "shot",
          peak,
          bend: 0,
          then,
        };
        b.owner = null;
        this.held.clear();
        return;
      }
      case "goal":
        b.dead = true;
        this.mode = "celebrate";
        this.scorer = { id: a.scorer, side: a.team, until: S + 2.2 };
        return;
      case "save": {
        b.owner = a.keeper;
        b.flight = null;
        return;
      }
      case "corner": {
        // Out over the byline, then to the flag; the taker goes over.
        const right = a.team === 0;
        const fy = hash(`${S}`) % 2 ? 0.5 : H - 0.5;
        b.flight = {
          from,
          to: { x: right ? W - 0.5 : 0.5, y: fy },
          t0: S,
          t1: S + Math.min(0.8, Math.max(0.3, a.until - S - 0.2)),
          kind: "ground",
          peak: 0,
          bend: 0,
          then: null,
        };
        b.owner = null;
        this.mode = "box";
        this.poss = a.team;
        const taker = [...this.ps.values()]
          .filter((p) => p.side === a.team && !p.gk)
          .sort(
            (p, q) => len(p.x - (right ? W : 0), p.y - fy) - len(q.x - (right ? W : 0), q.y - fy),
          )[0];
        if (taker) {
          this.cornerTaker = { id: taker.id, until: a.until + 0.1 };
          taker.job = { x: right ? W - 0.8 : 0.8, y: fy, until: a.until, sprint: true };
        }
        return;
      }
      case "dead":
        b.dead = true;
        b.flight = null;
        return;
      case "freekick": {
        // Placed 20–26 m out (rolled there, as a referee would), the taker over it.
        const gx = a.team === 0 ? W : 0;
        const dir = a.team === 0 ? 1 : -1;
        const h = hash(`${a.taker}${S}`);
        const spot = { x: gx - dir * (20 + (h % 7)), y: GOAL_Y + ((h % 21) - 10) };
        const d = len(spot.x - b.x, spot.y - b.y);
        b.flight =
          d > 1
            ? {
                from,
                to: spot,
                t0: S,
                t1: S + Math.max(0.4, Math.min(a.until - S - 0.3, d / 12)),
                kind: "ground",
                peak: 0,
                bend: 0,
                then: null,
              }
            : null;
        b.dead = true;
        b.owner = null;
        const taker = this.ps.get(a.taker);
        if (taker)
          taker.job = { x: spot.x - dir * 1.2, y: spot.y, until: a.until + 0.4, sprint: true };
        // The wall: their three nearest outfield men, 9 m off the ball on the line to goal.
        const ax = gx - spot.x;
        const ay = GOAL_Y - spot.y;
        const al = len(ax, ay);
        const wx = spot.x + (ax / al) * 9;
        const wy = spot.y + (ay / al) * 9;
        [...this.ps.values()]
          .filter((p) => p.side !== a.team && !p.gk)
          .sort((p, q) => len(p.x - wx, p.y - wy) - len(q.x - wx, q.y - wy))
          .slice(0, 3)
          .forEach((p, i) => {
            const k = (i - 1) * 1.3;
            p.job = { x: wx - (ay / al) * k, y: wy + (ax / al) * k, until: a.strike, sprint: true };
          });
        return;
      }
      default:
        return;
    }
    void o;
  }

  /** Every player re-reads the game every quarter of a second (staggered). */
  private think(
    S: number,
    tactics: [Tactics, Tactics],
    leaving: ReadonlySet<string>,
    o: Parameters<LiveSim["update"]>[1],
  ) {
    void o;
    const b = this.ball;
    const pct = { x: (b.x / W) * 100, y: (b.y / H) * 100 };
    if (this.scorer && S > this.scorer.until + 0.8 && this.mode === "celebrate")
      this.mode = "kickoff";
    if (this.cornerTaker && S > this.cornerTaker.until) this.cornerTaker = null;
    const owner = b.owner ? this.ps.get(b.owner) : undefined;
    const poss =
      owner?.side ?? (b.flight?.then ? this.ps.get(b.flight.then)?.side : undefined) ?? this.poss;
    // The defending side's nearest outfielder presses, kept unless someone is clearly closer.
    let presser: SimPlayer | undefined;
    if (poss !== null && poss !== undefined && this.mode === "open" && !b.dead) {
      const near = [...this.ps.values()]
        .filter((p) => p.side !== poss && !p.gk && !leaving.has(p.id))
        .sort((p, q) => len(p.x - b.x, p.y - b.y) - len(q.x - b.x, q.y - b.y));
      const was = this.pressing ? this.ps.get(this.pressing) : undefined;
      presser =
        was &&
        was.side !== poss &&
        near[0] &&
        len(was.x - b.x, was.y - b.y) < len(near[0].x - b.x, near[0].y - b.y) * 1.3
          ? was
          : near[0];
      this.pressing = presser?.id ?? null;
    }
    for (const p of this.ps.values()) {
      if (S < p.think) continue;
      p.think = S + 0.25;
      if (leaving.has(p.id)) {
        p.tx = p.x;
        p.ty = p.y < GOAL_Y ? -1 : H + 1;
        p.speed = 2;
        continue;
      }
      // His next reception in this move: get there as the ball does.
      const rec = this.plan.find((e) => e.id === p.id && e.at >= S - 0.05);
      if (rec && !(b.owner === p.id && this.held.has(p.id))) {
        p.tx = rec.x;
        p.ty = rec.y;
        p.speed = Math.min(
          p.vmax,
          Math.max(p.vmax * 0.55, len(rec.x - p.x, rec.y - p.y) / Math.max(0.1, rec.at - S) + 1),
        );
        continue;
      }
      if (p.job && S <= p.job.until) {
        p.tx = p.job.x;
        p.ty = p.job.y;
        p.speed = p.job.sprint ? p.vmax : p.vmax * 0.7;
        continue;
      }
      p.job = null;
      // Celebration: the scorer runs off, a few teammates chase him.
      if (this.mode === "celebrate" && this.scorer) {
        const sc = this.ps.get(this.scorer.id);
        if (p.id === this.scorer.id) {
          p.tx = this.scorer.side === 0 ? W - 3 : 3;
          p.ty = hash(p.id) % 2 ? 3 : H - 3;
          p.speed = p.vmax;
          continue;
        }
        if (sc && p.side === this.scorer.side && !p.gk && hash(p.id) % 3) {
          p.tx = sc.x + ((hash(p.id) % 5) - 2);
          p.ty = sc.y + ((hash(p.id) % 7) - 3);
          p.speed = p.vmax * 0.8;
          continue;
        }
      }
      const slots = formation(this.formationOf(p.side, o)).slots;
      const slot = slots[p.slot] ?? { pos: "CM" as const, x: 50, y: 50 };
      // In an attack the side on the ball pushes up ahead of it.
      const lead = this.attacking && p.side === poss ? (p.side === 0 ? 12 : -12) : 0;
      const spot = shapeSpot(
        p.side,
        slot,
        tactics[p.side],
        this.mode === "celebrate" ? "kickoff" : this.mode,
        { x: Math.min(100, Math.max(0, pct.x + lead)), y: pct.y },
        poss ?? null,
        this.mode === "box" ? this.poss : null,
      );
      let tx = (spot.x / 100) * W;
      let ty = (spot.y / 100) * H;
      let speed = p.vmax * 0.65;
      if (p.gk) {
        // On his line, between the ball and the middle of the goal.
        const gx = p.side === 0 ? 1.5 : W - 1.5;
        tx = gx + (p.side === 0 ? 1 : -1) * Math.min(6, Math.max(0, 14 - Math.abs(b.x - gx) / 4));
        ty = GOAL_Y + (b.y - GOAL_Y) * 0.15;
        speed = 4;
      } else if (presser && p.id === presser.id) {
        // Close him down, goal side.
        const back = p.side === 0 ? -1 : 1;
        tx = b.x + back * 1.5;
        ty = b.y;
        speed = p.vmax;
      } else if (poss !== null && poss !== undefined && p.side !== poss && this.mode === "open") {
        // Mark the nearest attacker in his area, goal side of him (half shape, half man).
        const mark = [...this.ps.values()]
          .filter((q) => q.side === poss && !q.gk)
          .sort((q, r) => len(q.x - tx, q.y - ty) - len(r.x - tx, r.y - ty))[0];
        if (mark && len(mark.x - tx, mark.y - ty) < 14) {
          const back = p.side === 0 ? -1 : 1;
          tx = (tx + mark.x + back * 1.5) / 2;
          ty = (ty + mark.y) / 2;
        }
      } else if (owner && p.id === owner.id && !this.held.has(p.id) && !this.inNet()) {
        // Passed to (or fouled for a free kick) but not there yet: go and get it.
        p.tx = b.x;
        p.ty = b.y;
        p.speed = p.vmax;
        continue;
      } else if (owner && p.id === owner.id && b.dead) {
        // Play's stopped (a foul on him, offside): he waits by the ball for the free kick.
        tx = b.x - (p.side === 0 ? 0.8 : -0.8);
        ty = b.y;
        speed = 2;
      } else if (owner && p.id === owner.id && !b.dead) {
        // On the ball between passes: a few steps on, shielding if someone's tight.
        const dir = p.side === 0 ? 1 : -1;
        const tight = [...this.ps.values()].some(
          (q) => q.side !== p.side && len(q.x - p.x, q.y - p.y) < 2.5,
        );
        tx = p.x + (tight ? 0 : dir * 2.5);
        ty = p.y;
        speed = tight ? 1.5 : p.vmax * 0.6;
      }
      // A little personal drift so nobody stands like a statue.
      const h = hash(p.id);
      tx += Math.sin(S * 0.7 + (h % 7)) * 0.8;
      ty += Math.cos(S * 0.5 + (h % 5)) * 0.8;
      p.tx = clampX(tx);
      p.ty = Math.min(H - 0.5, Math.max(0.5, ty));
      p.speed = speed;
    }
  }

  /**
   * A shoot-out at the x = 105 goal, in real time: everyone in the centre circle, the taker walks
   * up, strikes; the keeper dives (the wrong way when it goes in); the next taker comes forward.
   */
  private pensAt = -1;
  private pens(at: number, o: Parameters<LiveSim["update"]>[1]): SimFrame {
    this.mode = "pens";
    const PEN = 1500;
    const kicks = o.tl.events.filter((x) => x.e.t === "pen");
    const cur = kicks.findLast((x) => x.at - PEN + 300 <= at) ?? kicks[0];
    const e = cur?.e;
    const spot = { x: W - 11, y: GOAL_Y };
    const kickAt = (cur?.at ?? at) - 300;
    const dt = this.pensAt < 0 ? 0 : Math.min(0.1, Math.max(0, (at - this.pensAt) / 1000));
    this.pensAt = at;
    const b = this.ball;
    if (e?.t === "pen") {
      const right = hash(`${e.taker}${cur?.at}`) % 2 === 0;
      const aimY = GOAL_Y + (right ? 2.4 : -2.4);
      const diveY = e.scored ? GOAL_Y + (right ? -2 : 2) : aimY;
      let row = 0;
      for (const p of this.ps.values()) {
        if (p.id === e.taker) {
          p.tx = at < kickAt - 400 ? spot.x - 4 : spot.x - 0.8;
          p.ty = GOAL_Y;
          p.speed = 3;
        } else if (p.id === e.keeper) {
          p.tx = W - 0.6;
          p.ty = at >= kickAt ? diveY : GOAL_Y;
          p.speed = at >= kickAt ? 8 : 2;
        } else if (p.gk) {
          p.tx = W - 5;
          p.ty = p.side === 0 ? 18 : H - 18;
          p.speed = 3;
        } else {
          p.tx = W / 2 - 13 + (row++ % 10) * 2.8;
          p.ty = p.side === 0 ? GOAL_Y - 2 : GOAL_Y + 2;
          p.speed = 2;
        }
      }
      if (at < kickAt) {
        b.flight = null;
        b.owner = null;
        b.dead = true;
        // Rolled back to the spot.
        b.x += (spot.x - b.x) * Math.min(1, dt * 6);
        b.y += (spot.y - b.y) * Math.min(1, dt * 6);
        b.z = 0;
      } else {
        const u = Math.min(1, (at - kickAt) / 300);
        const to = e.scored ? { x: W + 1, y: aimY } : { x: W - 0.9, y: aimY };
        b.x = spot.x + (to.x - spot.x) * u;
        b.y = spot.y + (to.y - spot.y) * u;
        b.z = e.scored ? 0.6 * 4 * u * (1 - u) : 0;
      }
    }
    if (dt > 0) this.move(dt);
    else for (const p of this.ps.values()) Object.assign(p, { x: p.tx, y: p.ty });
    return this.frame();
  }

  /** The ball is over a goal line (a goal, or out for a goal kick). */
  private inNet() {
    return this.ball.x < 0 || this.ball.x > W;
  }

  private formationOf(side: Side, o: Parameters<LiveSim["update"]>[1]) {
    return o.current[side].formation;
  }

  /** Steer every player: accelerate towards his target, ease off as he arrives, keep apart. */
  private move(dt: number) {
    const list = [...this.ps.values()];
    for (const p of list) {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = len(dx, dy);
      // Ease off only as late as he can still stop (later still when he's running onto a ball).
      const brake = p.job?.sprint ? 8 : 5;
      const want = d < 0.05 ? 0 : Math.min(p.speed, Math.sqrt(2 * brake * d));
      let wx = d ? (dx / d) * want : 0;
      let wy = d ? (dy / d) * want : 0;
      // Personal space: push off anyone within 1.4 m.
      for (const q of list) {
        if (q === p) continue;
        // A man running onto a pass isn't pushed off his line by an opponent near him.
        if (p.job?.sprint && q.side !== p.side) continue;
        const sx = p.x - q.x;
        const sy = p.y - q.y;
        const sd = len(sx, sy);
        if (sd > 0 && sd < 1.4) {
          wx += (sx / sd) * (1.4 - sd) * 3;
          wy += (sy / sd) * (1.4 - sd) * 3;
        }
      }
      // Acceleration limits: about 4 m/s² speeding up, 6 slowing down.
      const ax = wx - p.vx;
      const ay = wy - p.vy;
      const a = len(ax, ay);
      const cap = (len(wx, wy) > len(p.vx, p.vy) ? 4 : 6) * dt;
      const k = a > cap ? cap / a : 1;
      p.vx += ax * k;
      p.vy += ay * k;
      const v = len(p.vx, p.vy);
      if (v > p.vmax) {
        p.vx = (p.vx / v) * p.vmax;
        p.vy = (p.vy / v) * p.vmax;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private moveBall(S: number, dt = STEP) {
    const b = this.ball;
    const f = b.flight;
    if (f) {
      const T = Math.max(0.05, f.t1 - f.t0);
      const u = Math.min(1, Math.max(0, (S - f.t0) / T));
      const dx = f.to.x - f.from.x;
      const dy = f.to.y - f.from.y;
      const d = len(dx, dy) || 1;
      // Along the ground the ball slows as it rolls (to a few m/s); in the air it keeps its pace.
      let s = u;
      if (f.kind === "ground") {
        const vEnd = Math.min(3, d / T);
        const a = Math.max(0, (2 * (d - vEnd * T)) / (T * T));
        const v0 = vEnd + a * T;
        const t = u * T;
        s = (v0 * t - 0.5 * a * t * t) / d;
      }
      const side = f.bend * 4 * u * (1 - u);
      b.x = f.from.x + dx * s + (-dy / d) * side;
      b.y = f.from.y + dy * s + (dx / d) * side;
      b.z = f.kind === "ground" ? 0 : 4 * f.peak * u * (1 - u);
      if (u >= 1) {
        b.flight = null;
        b.z = 0;
        b.owner = f.then;
        if (!f.then) b.dead = b.dead || f.kind === "shot";
      }
      return;
    }
    const p = b.owner ? this.ps.get(b.owner) : undefined;
    // A late receiver: the ball sits where it was played until he gets to it.
    if (p && !b.dead && !this.held.has(p.id) && len(p.x - b.x, p.y - b.y) > 1.6) return;
    if (p) this.held.add(p.id);
    if (p && !b.dead) {
      // At his feet, just ahead of him; the ball catches up smoothly (never jumps).
      const dir = p.side === 0 ? 1 : -1;
      const vx = p.vx || dir * 0.1;
      const vy = p.vy;
      const v = len(vx, vy) || 1;
      const fx = p.x + (vx / v) * 0.6;
      const fy = p.y + (vy / v) * 0.6;
      const k = Math.min(1, dt * 10);
      b.x += (fx - b.x) * k;
      b.y += (fy - b.y) * k;
      b.z = 0;
    }
  }

  /** After a jump: everyone straight to their place, the ball with its owner. */
  private place(
    tactics: [Tactics, Tactics],
    leaving: ReadonlySet<string>,
    o: Parameters<LiveSim["update"]>[1],
  ) {
    for (const p of this.ps.values()) p.think = 0;
    this.think(this.S, tactics, leaving, o);
    for (const p of this.ps.values()) {
      p.x = p.tx;
      p.y = p.ty;
      p.vx = p.vy = 0;
    }
    this.moveBall(this.S);
    const owner = this.ball.owner ? this.ps.get(this.ball.owner) : undefined;
    if (owner && !this.ball.flight) {
      this.ball.x = owner.x;
      this.ball.y = owner.y;
    }
  }

  /** Apply every action up to `S` without animating (for a jump). */
  private catchUp(
    S: number,
    _t: [Tactics, Tactics],
    _l: ReadonlySet<string>,
    o: Parameters<LiveSim["update"]>[1],
  ) {
    const acts = (this.compiled as ReturnType<typeof compile>).actions;
    this.next = 0;
    while (this.next < acts.length && (acts[this.next] as Action).s <= S) {
      const a = acts[this.next] as Action;
      this.next++;
      this.apply(a, a.s, o);
    }
  }
}

function clampX(x: number) {
  return Math.min(W + 0.5, Math.max(-0.5, x));
}

/** Where a box runner attacks a cross: near post, far post or the spot, by who he is. */
function boxSpot(p: SimPlayer, team: Side, h: number): V {
  const gx = team === 0 ? W : 0;
  const into = team === 0 ? -1 : 1;
  const spots: V[] = [
    { x: gx + into * 6, y: GOAL_Y - 4 },
    { x: gx + into * 7, y: GOAL_Y + 5 },
    { x: gx + into * 11, y: GOAL_Y },
  ];
  void p;
  return spots[h % spots.length] as V;
}
