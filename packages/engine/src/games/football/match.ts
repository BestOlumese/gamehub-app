// The match engine (docs/games/football-draft/match-engine.md): a seeded per-minute possession and
// event loop that makes shots with xG. Pure: same sheets + same RNG streams ⇒ the same match.
//
// Live decisions (Best, Oct 2026): managers can change tactics or make subs at any minute, so a
// match is played minute by minute. Every minute draws from its own stream (`stream("h1:m23")`),
// so changing nothing can't re-roll the future: only a real change alters what happens next.
// Players are referred to by id; `get` looks the cards up (the state stays small to store).
import type { Rng } from "../../types";
import { familiarity, formation, positionPenalty, ROLE_FOCUS, UNIT_WEIGHTS } from "./pitch";
import { chemistry, CHEM_MOD } from "./team";
import {
  isKeeperStats,
  type FootballPlayer,
  type OutfieldStats,
  type Position,
  type Role,
} from "./types";

export type BuildUp = "balanced" | "short" | "long" | "counter";
export type Defence = "balanced" | "high_press" | "mid_block" | "deep_block";
export type Tactics = {
  build: BuildUp;
  defence: Defence;
  /** 0–100, default 50. */
  line: number;
  width: number;
  tempo: number;
  /** Players in the box, 1–5 (default 3). */
  inBox: number;
};
export const DEFAULT_TACTICS: Tactics = {
  build: "balanced",
  defence: "balanced",
  line: 50,
  width: 50,
  tempo: 50,
  inBox: 3,
};

export type Lookup = (id: string) => FootballPlayer;
/** RNG streams by key: one per minute ("h2:m71"), one for the stoppage time, one for penalties. */
export type Streams = (key: string) => Rng;

export type SheetSlot = { id: string; role: Role; focus?: string };
/** A team as picked: one entry per formation slot (slot order), and the bench (ids). */
export type TeamSheet = {
  formation: number;
  xi: SheetSlot[];
  bench: string[];
  tactics: Tactics;
};

export type ChanceKind =
  | "build_up"
  | "through_ball"
  | "cross"
  | "long_shot"
  | "free_kick"
  | "corner"
  | "direct"
  | "counter";
export type ShotResult = "goal" | "saved" | "missed" | "blocked" | "post";
export type Side = 0 | 1;

export type MatchEvent =
  | {
      m: number;
      o: number;
      t: "kickoff" | "half_time" | "full_time" | "et_start" | "et_half" | "et_end";
    }
  | { m: number; o: number; t: "chance"; team: Side; kind: ChanceKind; player: string }
  | {
      m: number;
      o: number;
      t: "shot";
      team: Side;
      player: string;
      assist?: string;
      xg: number;
      result: ShotResult;
      header?: boolean;
    }
  | {
      m: number;
      o: number;
      t: "goal";
      team: Side;
      player: string;
      assist?: string;
      score: [number, number];
      header?: boolean;
    }
  | { m: number; o: number; t: "save"; team: Side; keeper: string; player: string }
  | { m: number; o: number; t: "corner" | "offside" | "free_kick"; team: Side; player?: string }
  | {
      m: number;
      o: number;
      t: "foul";
      team: Side;
      player: string;
      card?: "yellow" | "red" | "second_yellow";
    }
  | { m: number; o: number; t: "sub"; team: Side; off: string; on: string }
  | { m: number; o: number; t: "tactics"; team: Side; tactics: Tactics }
  | {
      m: number;
      o: number;
      t: "pen";
      team: Side;
      taker: string;
      keeper: string;
      scored: boolean;
      tally: [number, number];
    };

export type MatchStats = {
  possession: [number, number];
  shots: [number, number];
  onTarget: [number, number];
  xg: [number, number];
  corners: [number, number];
  fouls: [number, number];
  yellows: [number, number];
  reds: [number, number];
};

export type Live = {
  id: string;
  pos: Position;
  role: Role;
  focus: string;
  fit: number;
  yellow: boolean;
  /** Sent off. */
  off: boolean;
};

export type TeamState = {
  formation: number;
  xi: Live[];
  bench: string[];
  tactics: Tactics;
  subsUsed: number;
  /** Players who have left the pitch (subbed off); they can't come back. */
  gone: string[];
};

export type MatchState = {
  teams: [TeamState, TeamState];
  score: [number, number];
  stats: MatchStats;
  /** The half being played (1, 2; 3, 4 in extra time); 0 before kickoff. */
  half: number;
  /** Minutes played in this half (stoppage included). */
  minute: number;
  /** This half's length with stoppage time (45 + 1–4, or 15 + 1–2). */
  length: number;
  /** Is the current half finished? */
  halfDone: boolean;
  knockout: boolean;
  chemistry: boolean;
  subsPerMatch: number;
  pens: { kicks: Array<{ team: Side; scored: boolean }>; tally: [number, number] } | null;
  ballMinutes: [number, number];
  /** The side whose move broke down last minute (the other side counters). */
  lastFail: Side | null;
};

/**
 * Tuning constants (match-engine.md → tuning log). Tuned Oct 2026 on dataset 2026.10.1:
 * strength sensitivity much softer than first proposed (possession exponent 2, duel scale 20,
 * quality scale 200), or a 3-point better team won 70 % of the time.
 */
export const C = {
  possessionExp: 2,
  attackRate: 0.52,
  duelScale: 20,
  /** Chance per minute that the side without the ball commits a foul. */
  foulPerMin: 0.22,
  yellowPerFoul: 0.14,
  redPerFoul: 0.002,
  xg: {
    build_up: 0.14,
    through_ball: 0.25,
    cross: 0.1,
    long_shot: 0.04,
    free_kick: 0.06,
    corner: 0.07,
    direct: 0.12,
    counter: 0.2,
  } as Record<ChanceKind, number>,
  qualityScale: 200,
  /** Every chance's xG is scaled by this. */
  xgScale: 0.95,
  onTargetBase: 0.25,
  cornerOnFail: 0.35,
  cornerShot: 0.3,
  offsideBase: 0.08,
  freeKickShot: 0.06,
  postShare: 0.04,
  fatiguePerMin: 0.55,
  /**
   * How strongly a style matchup moves the duel and the chance quality (tactics.md → Matchups).
   * 1.5: the right answer to an extreme setup is worth about 5 rating points (Best, Oct 2026).
   */
  matchup: 1.5,
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
/** A uniform draw in [0, 1) from the integer RNG. */
const u = (rng: Rng) => rng.int(1_000_000) / 1_000_000;
const pick = <T>(rng: Rng, items: readonly T[], w: (t: T) => number): T => {
  const ws = items.map((t) => Math.max(0, w(t)));
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[rng.int(items.length)] as T;
  let r = u(rng) * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i] as number;
    if (r < 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
};

const stat = (p: FootballPlayer, k: keyof OutfieldStats) =>
  isKeeperStats(p.stats) ? 30 : (p.stats as OutfieldStats)[k];
const keeperStp = (p: FootballPlayer) => (isKeeperStats(p.stats) ? p.stats.stp : 25);

/** Role shifts of a slot's unit weights [DEF, MID, ATT] (tactics.md → Player roles). */
const ROLE_SHIFT: Partial<Record<Role, [number, number, number]>> = {
  full_back: [0.1, 0, -0.1],
  attacking_full_back: [-0.1, 0, 0.1],
  inverted_full_back: [-0.15, 0.15, 0],
  complete_wing_back: [-0.15, 0, 0.15],
  anchor: [0.1, -0.1, 0],
  ball_playing_defender: [-0.08, 0.08, 0],
  box_to_box: [0, -0.1, 0.1],
  roaming_midfielder: [0, -0.1, 0.1],
  defensive_winger: [0.1, 0, -0.1],
  false_nine: [0, 0.2, -0.2],
};

/** How likely a role is to take the shot / make the pass (on top of the slot's ATT weight). */
const SHOOT: Partial<Record<Role, number>> = {
  poacher: 2.2,
  advanced_forward: 1.6,
  target_forward: 1.5,
  pressing_forward: 1.3,
  false_nine: 1.0,
  shadow_striker: 1.6,
  inside_forward: 1.4,
  roaming_midfielder: 1.2,
  box_to_box: 1.1,
};
const CREATE: Partial<Record<Role, number>> = {
  playmaker: 2,
  advanced_playmaker: 2,
  classic_ten: 1.8,
  deep_playmaker: 1.5,
  wide_playmaker: 1.6,
  false_nine: 1.5,
  winger: 1.4,
  attacking_full_back: 1.2,
  wing_back: 1.2,
  complete_wing_back: 1.4,
};

const fatigueMod = (fit: number) => (fit >= 92 ? 0 : -Math.ceil((92 - fit) / 8));

// ---- Team strength ----

type Units = {
  gk: number;
  def: number;
  mid: number;
  att: number;
  keeper: Live | null;
  /** Averages that decide style matchups: midfield passing, attack pace and power, defence pace and power. */
  midPas: number;
  attSpd: number;
  attPow: number;
  defSpd: number;
  defPow: number;
};

function slotPos(t: TeamState, i: number, x: Live): Position {
  return formation(t.formation).slots[i]?.pos ?? x.pos;
}

function units(t: TeamState, chem: boolean, get: Lookup): Units {
  const players = t.xi.map((x) => get(x.id));
  const pts = chem
    ? chemistry(
        t.xi.map((x, i) => ({ player: players[i] as FootballPlayer, pos: x.pos, role: x.role })),
      )
    : null;
  const eff = t.xi.map(
    (x, i) =>
      (players[i] as FootballPlayer).ovr -
      positionPenalty(players[i] as FootballPlayer, x.pos) +
      familiarity(players[i] as FootballPlayer, x.role) +
      (pts ? CHEM_MOD[pts[i] as 0 | 1 | 2 | 3] : 0) +
      fatigueMod(x.fit),
  );
  const sum = [0, 0, 0];
  const full = [0, 0, 0];
  let keeper: Live | null = null;
  let gk = 40;
  const avg = { midPas: [0, 0], attSpd: [0, 0], attPow: [0, 0], defSpd: [0, 0], defPow: [0, 0] };
  const add = (k: keyof typeof avg, v: number, w: number) => {
    avg[k][0] = (avg[k][0] as number) + v * w;
    avg[k][1] = (avg[k][1] as number) + w;
  };
  t.xi.forEach((x, i) => {
    const pos = slotPos(t, i, x);
    const p = players[i] as FootballPlayer;
    if (pos === "GK") {
      if (!x.off) {
        keeper = x;
        gk = eff[i] as number;
      }
      return;
    }
    const base = UNIT_WEIGHTS[pos];
    const sh = ROLE_SHIFT[x.role] ?? [0, 0, 0];
    const w = [0, 1, 2].map((k) => Math.max(0, (base[k] as number) + (sh[k] as number)));
    for (let k = 0; k < 3; k++) {
      full[k] = (full[k] as number) + (w[k] as number);
      if (!x.off) sum[k] = (sum[k] as number) + (w[k] as number) * (eff[i] as number);
    }
    if (x.off) return;
    add("midPas", stat(p, "pas"), w[1] as number);
    add("attSpd", stat(p, "spd"), w[2] as number);
    add("attPow", stat(p, "pow"), w[2] as number);
    add("defSpd", stat(p, "spd"), w[0] as number);
    add("defPow", stat(p, "pow"), w[0] as number);
  });
  // Normalised by the full XI's weight: a red card lowers the unit.
  const [def, mid, att] = sum.map((s, k) => s / Math.max(0.5, full[k] as number)) as [
    number,
    number,
    number,
  ];
  const mean = (k: keyof typeof avg) =>
    avg[k][1] ? (avg[k][0] as number) / (avg[k][1] as number) : 60;
  return {
    gk,
    def,
    mid,
    att,
    keeper,
    midPas: mean("midPas"),
    attSpd: mean("attSpd"),
    attPow: mean("attPow"),
    defSpd: mean("defSpd"),
    defPow: mean("defPow"),
  };
}

/** Possession multiplier from tactics (tactics.md → Team tactics). */
function possessionMult(t: Tactics) {
  let m = 1;
  if (t.build === "short") m *= 1.06;
  if (t.build === "long") m *= 0.94;
  if (t.build === "counter") m *= 0.9;
  if (t.defence === "high_press") m *= 1.08;
  if (t.defence === "deep_block") m *= 0.9;
  if (t.line < 50) m *= 1 - (50 - t.line) * 0.001;
  return m;
}

/**
 * The style matchup for an attacking side against a defending side: an edge added to the
 * progress duel, and a factor on chance quality (tactics.md → Matchups). The cycle:
 * pressing beats short passing with weak passers; long balls and counters beat the press;
 * a deep block stops long balls and counters but gives way to patient passing.
 */
export function matchup(a: Tactics, d: Tactics, A: Units, D: Units): number {
  let e = 0;
  const press = d.defence === "high_press";
  const deep = d.defence === "deep_block";
  const highLine = clamp((d.line - 50) / 35, -1, 1);
  switch (a.build) {
    case "short":
      if (press) e += -0.3 + 0.02 * (A.midPas - 75);
      else if (deep) e += 0.25;
      else e += 0.05;
      break;
    case "long":
      if (press) e += 0.3;
      else if (deep) e += -0.3 + 0.02 * (A.attPow - D.defPow);
      else e += -0.05 + 0.01 * (A.attPow - D.defPow);
      break;
    case "counter":
      if (deep) e -= 0.3;
      else e += (press ? 0.2 : 0) + 0.15 * Math.max(0, highLine) + 0.01 * (A.attSpd - D.defSpd);
      break;
    default:
      if (press || deep) e -= 0.05;
  }
  // Pace in behind a high line, whatever the style.
  if (highLine > 0) e += 0.1 * highLine * clamp((A.attSpd - D.defSpd) / 10, -1, 1.5);
  return e * C.matchup;
}

// ---- Setup ----

const teamFrom = (s: TeamSheet): TeamState => {
  const slots = formation(s.formation).slots;
  return {
    formation: s.formation,
    xi: s.xi.map((x, i) => ({
      id: x.id,
      pos: (slots[i] as { pos: Position }).pos,
      role: x.role,
      focus: x.focus ?? (ROLE_FOCUS[x.role][0] as string),
      fit: 100,
      yellow: false,
      off: false,
    })),
    bench: [...s.bench],
    tactics: { ...s.tactics },
    subsUsed: 0,
    gone: [],
  };
};

export function startMatch(
  home: TeamSheet,
  away: TeamSheet,
  opts: { knockout: boolean; chemistry: boolean; subsPerMatch: number },
): MatchState {
  const zero = (): [number, number] => [0, 0];
  return {
    teams: [teamFrom(home), teamFrom(away)],
    score: [0, 0],
    stats: {
      possession: [50, 50],
      shots: zero(),
      onTarget: zero(),
      xg: zero(),
      corners: zero(),
      fouls: zero(),
      yellows: zero(),
      reds: zero(),
    },
    half: 0,
    minute: 0,
    length: 0,
    halfDone: true,
    knockout: opts.knockout,
    chemistry: opts.chemistry,
    subsPerMatch: opts.subsPerMatch,
    pens: null,
    ballMinutes: [0, 0],
    lastFail: null,
  };
}

const clone = (m: MatchState): MatchState => ({
  ...m,
  teams: m.teams.map((t) => ({
    ...t,
    xi: t.xi.map((x) => ({ ...x })),
    bench: [...t.bench],
    tactics: { ...t.tactics },
    gone: [...t.gone],
  })) as [TeamState, TeamState],
  score: [...m.score],
  stats: Object.fromEntries(Object.entries(m.stats).map(([k, v]) => [k, [...v]])) as MatchStats,
  pens: m.pens ? { kicks: [...m.pens.kicks], tally: [...m.pens.tally] } : null,
  ballMinutes: [...m.ballMinutes],
});

// ---- Where the match is ----

const HALF_START = [0, 0, 45, 90, 105] as const;
/** The match clock for the current minute (stoppage shows as 45, 90…: the client adds "+n"). */
export const clockMinute = (m: MatchState) => {
  const len = m.half > 2 ? 15 : 45;
  return (HALF_START[m.half] ?? 0) + Math.min(m.minute, len);
};

const penaltiesDone = (p: NonNullable<MatchState["pens"]>) => {
  const n = [0, 0];
  for (const k of p.kicks) n[k.team] = (n[k.team] as number) + 1;
  const [a, b] = p.tally;
  const [na, nb] = n as [number, number];
  if (na <= 5 && nb <= 5) {
    if (a > b + (5 - nb)) return true;
    if (b > a + (5 - na)) return true;
    return na === 5 && nb === 5 && a !== b;
  }
  return na === nb && a !== b;
};

/** Is the match over (90 minutes, or extra time and penalties in a level knockout)? */
export function isFinished(m: MatchState): boolean {
  if (m.pens) return penaltiesDone(m.pens);
  if (m.half < 2 || !m.halfDone) return false;
  return !m.knockout || m.score[0] !== m.score[1] ? true : false;
}

/** What comes next: a new half, more minutes of this one, the shoot-out, or nothing. */
export function nextPhase(m: MatchState): "half" | "minutes" | "penalties" | "over" {
  if (isFinished(m)) return "over";
  if (!m.halfDone) return "minutes";
  return m.half < 4 ? "half" : "penalties";
}

export function winner(m: MatchState): Side | "draw" | null {
  if (!isFinished(m)) return null;
  if (m.pens) return m.pens.tally[0] > m.pens.tally[1] ? 0 : 1;
  return m.score[0] > m.score[1] ? 0 : m.score[1] > m.score[0] ? 1 : "draw";
}

// ---- Playing ----

type Out = { state: MatchState; events: MatchEvent[] };

/** Kicks off the next half: its stoppage time is drawn now (from its own stream). */
export function startHalf(prev: MatchState, streams: Streams): Out {
  const m = clone(prev);
  m.half++;
  m.minute = 0;
  m.halfDone = false;
  const extra = m.half > 2;
  m.length = (extra ? 15 : 45) + 1 + streams(`h${m.half}:stoppage`).int(extra ? 2 : 4);
  m.lastFail = null;
  return {
    state: m,
    events: [{ m: HALF_START[m.half] ?? 0, o: 0, t: m.half === 3 ? "et_start" : "kickoff" }],
  };
}

/** Plays minutes of the current half up to `until` (inclusive; capped at the half's end). */
export function playMinutes(prev: MatchState, until: number, streams: Streams, get: Lookup): Out {
  const m = clone(prev);
  const ev: MatchEvent[] = [];
  const end = Math.min(until, m.length);
  while (m.minute < end) {
    m.minute++;
    playMinute(m, streams(`h${m.half}:m${m.minute}`), get, ev);
  }
  if (m.minute >= m.length && !m.halfDone) {
    m.halfDone = true;
    const total = m.ballMinutes[0] + m.ballMinutes[1];
    if (total) {
      const p0 = Math.round((m.ballMinutes[0] / total) * 100);
      m.stats.possession = [p0, 100 - p0];
    }
    ev.push({
      m: (HALF_START[m.half] ?? 0) + (m.half > 2 ? 15 : 45),
      o: 999,
      t:
        m.half === 1
          ? "half_time"
          : m.half === 2
            ? "full_time"
            : m.half === 3
              ? "et_half"
              : "et_end",
    });
  }
  return { state: m, events: ev };
}

function playMinute(m: MatchState, rng: Rng, get: Lookup, ev: MatchEvent[]) {
  const mm = clockMinute(m);
  let o = 0;
  const push = (e: MatchEvent) => ev.push(e);
  const next = () => o++;
  const U = [units(m.teams[0], m.chemistry, get), units(m.teams[1], m.chemistry, get)] as const;
  // 1. Possession.
  const a = Math.pow(Math.max(1, U[0].mid), C.possessionExp) * possessionMult(m.teams[0].tactics);
  const b = Math.pow(Math.max(1, U[1].mid), C.possessionExp) * possessionMult(m.teams[1].tactics);
  const side: Side = u(rng) < a / (a + b) ? 0 : 1;
  const opp: Side = side === 0 ? 1 : 0;
  m.ballMinutes[side]++;
  const T = m.teams[side];
  const D = m.teams[opp];
  const tac = T.tactics;
  const dtac = D.tactics;
  const transition = m.lastFail === opp;
  m.lastFail = null;
  // A foul by the side without the ball (pressing sides foul more).
  if (u(rng) < C.foulPerMin * (dtac.defence === "high_press" ? 1.15 : 1)) {
    foul(m, opp, side, rng, get, push, mm, next);
    fatigue(m);
    return;
  }
  // 2. An attacking move?
  let rate = C.attackRate * (1 + (tac.tempo - 50) * 0.004);
  if (dtac.defence === "high_press") rate *= 0.92;
  if (tac.defence === "deep_block") rate *= 0.9; // sitting deep, fewer bodies forward
  if (transition && tac.build === "counter") rate *= 1.4;
  if (u(rng) >= rate) {
    fatigue(m);
    return;
  }
  // 3. Progress duel, with the style matchup.
  const direct = tac.build === "long" && u(rng) < 0.25;
  const style = matchup(tac, dtac, U[side], U[opp]);
  let edge = (U[side].att - U[opp].def) / C.duelScale + style;
  if (direct) edge += 0.05;
  if (u(rng) >= sigmoid(edge)) {
    m.lastFail = side;
    fatigue(m);
    return;
  }
  // 4. Chance type.
  const kind: ChanceKind =
    transition && tac.build === "counter" && u(rng) < 0.6
      ? "counter"
      : chanceKind(T, D, direct, rng);
  // Offside on balls in behind (their line).
  if (
    (kind === "through_ball" || kind === "counter") &&
    u(rng) < C.offsideBase * (dtac.line / 50)
  ) {
    const runner = shooter(T, rng, get);
    push({ m: mm, o: next(), t: "offside", team: side, player: runner.id });
    fatigue(m);
    return;
  }
  // 5–7. Shooter, assister, xG and the outcome.
  shoot(m, side, kind, transition, U, style, rng, get, push, mm, next);
  fatigue(m);
}

function fatigue(m: MatchState) {
  for (const t of m.teams) {
    const tac = t.tactics;
    let rate = C.fatiguePerMin * (1 + (tac.tempo - 50) * 0.003);
    if (tac.defence === "high_press") rate *= 1.2;
    for (const x of t.xi) {
      if (x.off) continue;
      let r = rate;
      if (x.role === "complete_wing_back" || x.role === "pressing_forward") r *= 1.1;
      if (x.pos === "GK") r *= 0.3;
      x.fit = Math.max(60, x.fit - r);
    }
  }
}

function chanceKind(T: TeamState, D: TeamState, direct: boolean, rng: Rng): ChanceKind {
  if (direct) return "direct";
  const tac = T.tactics;
  const cross = clamp(0.3 + (tac.width - 50) * 0.006, 0.1, 0.6);
  const through = clamp(0.2 + (D.tactics.line - 50) * 0.004, 0.08, 0.4);
  const r = u(rng);
  if (r < cross) return "cross";
  if (r < cross + through) return "through_ball";
  if (r < cross + through + (D.tactics.defence === "deep_block" ? 0.2 : 0.12)) return "long_shot";
  return "build_up";
}

function onPitch(t: TeamState) {
  return t.xi.map((x, i) => ({ x, i })).filter(({ x, i }) => !x.off && slotPos(t, i, x) !== "GK");
}

function shooter(t: TeamState, rng: Rng, get: Lookup, header = false): Live {
  return pick(rng, onPitch(t), ({ x, i }) => {
    const p = get(x.id);
    const w = (UNIT_WEIGHTS[slotPos(t, i, x)][2] as number) + 0.05;
    const bias = header ? stat(p, "pow") / 70 : stat(p, "fin") / 70;
    return w * (SHOOT[x.role] ?? 1) * bias * bias;
  }).x;
}

function assister(t: TeamState, not: Live, rng: Rng, get: Lookup): Live | undefined {
  const pool = onPitch(t).filter(({ x }) => x !== not);
  if (!pool.length) return undefined;
  return pick(rng, pool, ({ x, i }) => {
    const pos = slotPos(t, i, x);
    const w = (UNIT_WEIGHTS[pos][1] as number) * 0.6 + (UNIT_WEIGHTS[pos][2] as number);
    return w * (CREATE[x.role] ?? 1) * (stat(get(x.id), "pas") / 70);
  }).x;
}

function shoot(
  m: MatchState,
  side: Side,
  kind: ChanceKind,
  transition: boolean,
  U: readonly [Units, Units],
  style: number,
  rng: Rng,
  get: Lookup,
  push: (e: MatchEvent) => void,
  mm: number,
  next: () => number,
) {
  const opp: Side = side === 0 ? 1 : 0;
  const T = m.teams[side];
  const D = m.teams[opp];
  const header = kind === "cross" || kind === "corner" ? u(rng) < 0.6 : false;
  const shot = shooter(T, rng, get, header);
  const sp = get(shot.id);
  const assist =
    kind === "long_shot" || kind === "free_kick" ? undefined : assister(T, shot, rng, get);
  if (kind !== "build_up")
    push({ m: mm, o: next(), t: "chance", team: side, kind, player: shot.id });
  // xG: the chance's base × quality (ATT vs DEF, the style matchup, the stat that matters).
  let q = (1 + (U[side].att - U[opp].def) / C.qualityScale) * (1 + 0.4 * style);
  if (kind === "through_ball" || kind === "counter")
    q *=
      1 +
      clamp((stat(sp, "spd") - U[opp].defSpd) / 40, -0.3, 0.4) *
        clamp((D.tactics.line - 30) / 40, 0, 1.5);
  if (header) q *= 1 + clamp((stat(sp, "pow") - U[opp].defPow) / 60, -0.3, 0.4);
  if (transition && D.tactics.defence === "high_press") q *= 1.15;
  if (T.tactics.build === "short") q *= 0.97;
  if (D.tactics.defence === "deep_block" && kind !== "cross" && kind !== "long_shot") q *= 0.85;
  q *= 1 - (T.tactics.tempo - 50) * 0.002;
  q *= 1 + (T.tactics.inBox - 3) * 0.04;
  if (transition) q *= 1 + (D.tactics.inBox - 3) * 0.06;
  if (
    (kind === "through_ball" || kind === "counter") &&
    D.xi.some((x) => !x.off && x.role === "sweeper_keeper")
  )
    q *= 0.9;
  const xg = clamp(C.xg[kind] * C.xgScale * q, 0.02, 0.65);
  m.stats.shots[side]++;
  m.stats.xg[side] += xg;
  const fin = header ? (stat(sp, "pow") + stat(sp, "fin")) / 2 : stat(sp, "fin");
  const keeper = U[opp].keeper;
  const stp = keeper ? keeperStp(get(keeper.id)) : 25;
  const pOn = clamp(C.onTargetBase + (0.25 * (fin - 60)) / 40, 0.2, 0.6);
  const pGoal = Math.min(0.95, xg * (1 + (fin - 75) / 100) * (1 - (stp - 75) / 150));
  const r = u(rng);
  let result: ShotResult;
  if (r < pGoal) result = "goal";
  else if (r < Math.max(pOn, pGoal + 0.01)) result = "saved";
  else {
    const rest = u(rng);
    result = rest < C.postShare ? "post" : rest < 0.32 ? "blocked" : "missed";
  }
  push({
    m: mm,
    o: next(),
    t: "shot",
    team: side,
    player: shot.id,
    ...(assist && result === "goal" ? { assist: assist.id } : {}),
    xg: Math.round(xg * 100) / 100,
    result,
    ...(header ? { header: true } : {}),
  });
  if (result === "goal" || result === "saved") m.stats.onTarget[side]++;
  if (result === "goal") {
    m.score[side]++;
    push({
      m: mm,
      o: next(),
      t: "goal",
      team: side,
      player: shot.id,
      ...(assist ? { assist: assist.id } : {}),
      score: [m.score[0], m.score[1]],
      ...(header ? { header: true } : {}),
    });
    return;
  }
  if (result === "saved" && keeper)
    push({ m: mm, o: next(), t: "save", team: opp, keeper: keeper.id, player: shot.id });
  const cornerOdds =
    result === "blocked" || result === "saved"
      ? C.cornerOnFail
      : kind === "cross"
        ? C.cornerOnFail * 0.6
        : 0;
  if (u(rng) < cornerOdds) {
    m.stats.corners[side]++;
    push({ m: mm, o: next(), t: "corner", team: side });
    if (kind !== "corner" && u(rng) < C.cornerShot * (1 + (T.tactics.width - 50) * 0.004))
      shoot(m, side, "corner", false, U, style, rng, get, push, mm, next);
  }
}

function foul(
  m: MatchState,
  side: Side,
  victim: Side,
  rng: Rng,
  get: Lookup,
  push: (e: MatchEvent) => void,
  mm: number,
  next: () => number,
) {
  const T = m.teams[side];
  const pool = onPitch(T);
  if (!pool.length) return;
  const offender = pick(rng, pool, ({ x, i }) => {
    const pos = slotPos(T, i, x);
    const w = (UNIT_WEIGHTS[pos][0] as number) + (UNIT_WEIGHTS[pos][1] as number) * 0.5 + 0.05;
    const rough = x.role === "ball_winner" || x.role === "stopper" ? 1.6 : 1;
    return w * rough * (x.yellow ? 0.3 : 1); // on a yellow, they're careful
  }).x;
  m.stats.fouls[side]++;
  const r = u(rng);
  let card: "yellow" | "red" | "second_yellow" | undefined;
  const rough = offender.role === "ball_winner" || offender.role === "stopper" ? 1.3 : 1;
  if (r < C.redPerFoul) card = "red";
  else if (r < C.redPerFoul + C.yellowPerFoul * rough * (offender.yellow ? 0.6 : 1))
    card = offender.yellow ? "second_yellow" : "yellow";
  if (card === "yellow") {
    offender.yellow = true;
    m.stats.yellows[side]++;
  } else if (card) {
    if (card === "second_yellow") m.stats.yellows[side]++;
    offender.off = true;
    m.stats.reds[side]++;
  }
  push({ m: mm, o: next(), t: "foul", team: side, player: offender.id, ...(card ? { card } : {}) });
  // A foul in the final third: a free kick, sometimes a direct shot.
  if (u(rng) < C.freeKickShot) {
    push({ m: mm, o: next(), t: "free_kick", team: victim });
    const U = [units(m.teams[0], m.chemistry, get), units(m.teams[1], m.chemistry, get)] as const;
    shoot(m, victim, "free_kick", false, U, 0, rng, get, push, mm, next);
  }
}

// ---- Changes (any minute, and between halves) ----

export type Change =
  | { type: "sub"; off: string; on: string }
  | { type: "tactics"; tactics: Tactics }
  | { type: "role"; slot: number; role: Role; focus?: string }
  | { type: "formation"; formation: number }
  | { type: "swap"; a: number; b: number };

/** Subs allowed: the room's number, and one more once extra time starts. */
export const subsAllowed = (m: MatchState) => m.subsPerMatch + (m.half >= 3 ? 1 : 0);

/** Why a change can't be made now, or null. */
export function whyNotChange(m: MatchState, side: Side, c: Change): string | null {
  if (isFinished(m)) return "The match is over";
  if (m.pens) return "Penalties: no changes";
  const t = m.teams[side];
  if (c.type === "sub") {
    if (t.subsUsed >= subsAllowed(m)) return "No subs left";
    const out = t.xi.find((x) => x.id === c.off);
    if (!out || out.off) return "He isn't on the pitch";
    if (!t.bench.includes(c.on)) return "He isn't on the bench";
    return null;
  }
  if (c.type === "role") return t.xi[c.slot] ? null : "No such slot";
  if (c.type === "swap") {
    const a = t.xi[c.a];
    const b = t.xi[c.b];
    if (!a || !b || c.a === c.b) return "No such slots";
    if (a.off || b.off) return "A sent-off player can't move";
    return null;
  }
  if (c.type === "formation") {
    try {
      formation(c.formation);
      return null;
    } catch {
      return "No such formation";
    }
  }
  return null;
}

/** Applies a change now (subs come on fresh in the same slot). */
export function applyChange(prev: MatchState, side: Side, c: Change): Out {
  const m = clone(prev);
  const t = m.teams[side];
  const ev: MatchEvent[] = [];
  const mm = clockMinute(m);
  if (c.type === "sub") {
    const i = t.xi.findIndex((x) => x.id === c.off);
    const cur = t.xi[i];
    if (!cur) return { state: m, events: ev };
    t.xi[i] = { ...cur, id: c.on, fit: 100, yellow: false };
    t.bench = t.bench.filter((id) => id !== c.on);
    t.gone.push(c.off);
    t.subsUsed++;
    ev.push({ m: mm, o: 900, t: "sub", team: side, off: c.off, on: c.on });
  } else if (c.type === "tactics") {
    t.tactics = { ...c.tactics };
    if (m.half > 0 && !m.halfDone)
      ev.push({ m: mm, o: 900, t: "tactics", team: side, tactics: { ...c.tactics } });
  } else if (c.type === "role") {
    const x = t.xi[c.slot];
    if (x) {
      x.role = c.role;
      x.focus = c.focus ?? (ROLE_FOCUS[c.role][0] as string);
    }
  } else if (c.type === "swap") {
    const a = t.xi[c.a] as Live;
    const b = t.xi[c.b] as Live;
    t.xi[c.a] = { ...b, pos: a.pos };
    t.xi[c.b] = { ...a, pos: b.pos };
  } else if (c.type === "formation") {
    const slots = formation(c.formation).slots;
    t.formation = c.formation;
    t.xi = t.xi.map((x, i) => ({ ...x, pos: (slots[i] as { pos: Position }).pos }));
  }
  return { state: m, events: ev };
}

// ---- Penalties ----

/** The shoot-out: 5 each, alternating, then sudden death. Takers: best finishers first, keeper last. */
export function shootout(prev: MatchState, streams: Streams, get: Lookup): Out {
  const m = clone(prev);
  const rng = streams("pens");
  m.pens = { kicks: [], tally: [0, 0] };
  const ev: MatchEvent[] = [];
  const order = m.teams.map((t) =>
    t.xi
      .filter((x) => !x.off)
      .sort(
        (x, y) =>
          (x.pos === "GK" ? 1 : 0) - (y.pos === "GK" ? 1 : 0) ||
          stat(get(y.id), "fin") - stat(get(x.id), "fin"),
      ),
  ) as [Live[], Live[]];
  for (let k = 0; !penaltiesDone(m.pens) && k < 60; k++) {
    const side = (k % 2) as Side;
    const opp: Side = side === 0 ? 1 : 0;
    const takers = order[side];
    const taker = takers[Math.floor(k / 2) % takers.length] as Live;
    const keeper = m.teams[opp].xi.find((x) => x.pos === "GK" && !x.off) ?? order[opp][0];
    const sudden = k >= 10;
    const p = clamp(
      0.76 +
        0.004 * (stat(get(taker.id), "fin") - 75) -
        0.003 * ((keeper ? keeperStp(get(keeper.id)) : 50) - 75) -
        (sudden ? 0.03 : 0),
      0.55,
      0.92,
    );
    const scored = u(rng) < p;
    if (scored) m.pens.tally[side]++;
    m.pens.kicks.push({ team: side, scored });
    ev.push({
      m: 120,
      o: k,
      t: "pen",
      team: side,
      taker: taker.id,
      keeper: keeper?.id ?? "",
      scored,
      tally: [m.pens.tally[0], m.pens.tally[1]],
    });
  }
  return { state: m, events: ev };
}

/** Plays a whole match with no changes (tests and quick results). */
export function playMatch(state: MatchState, streams: Streams, get: Lookup): Out {
  let m = state;
  const all: MatchEvent[] = [];
  for (let guard = 0; guard < 12; guard++) {
    const phase = nextPhase(m);
    if (phase === "over") break;
    const r =
      phase === "half"
        ? startHalf(m, streams)
        : phase === "minutes"
          ? playMinutes(m, 999, streams, get)
          : shootout(m, streams, get);
    m = r.state;
    all.push(...r.events);
  }
  return { state: m, events: all };
}
