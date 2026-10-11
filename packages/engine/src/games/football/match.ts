// The match engine (docs/games/football-draft/match-engine.md): a seeded per-minute possession and
// event loop that makes shots with xG. Pure: same sheets + same RNG stream ⇒ the same match.
import type { Rng } from "../../types";
import { familiarity, formation, GROUP, positionPenalty, ROLE_FOCUS, UNIT_WEIGHTS } from "./pitch";
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

export type SheetSlot = { player: FootballPlayer; role: Role; focus?: string };
/** A team as picked: one entry per formation slot (slot order), and the bench. */
export type TeamSheet = {
  formation: number;
  xi: SheetSlot[];
  bench: FootballPlayer[];
  tactics: Tactics;
};

export type ChanceKind =
  "build_up" | "through_ball" | "cross" | "long_shot" | "free_kick" | "corner" | "direct";
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

type Live = {
  player: FootballPlayer;
  pos: Position;
  role: Role;
  focus: string;
  fit: number;
  yellow: boolean;
  /** Sent off (or subbed off: then he's gone from `xi`). */
  off: boolean;
};

export type TeamState = {
  formation: number;
  xi: Live[];
  bench: FootballPlayer[];
  tactics: Tactics;
  subsUsed: number;
  /** Players who have left the pitch (subbed off), can't come back. */
  gone: string[];
};

export type MatchState = {
  teams: [TeamState, TeamState];
  score: [number, number];
  stats: MatchStats;
  /** Halves played: 0 before kickoff, 2 at full time, 4 after extra time. */
  halves: number;
  knockout: boolean;
  chemistry: boolean;
  subsPerMatch: number;
  /** Penalty shoot-out: kicks taken in order (0 or 1 per kick) and the tally. */
  pens: { kicks: Array<{ team: Side; scored: boolean }>; tally: [number, number] } | null;
  /** Ball-winning counts per minute for stats: team that had the ball (for possession). */
  ballMinutes: [number, number];
};

/**
 * Tuning constants (match-engine.md → Calibration; tuning log there). Tuned Oct 2026 on dataset
 * 2026.10.1: strength sensitivity is much softer than first proposed (possession exponent 2, duel
 * scale 20, quality scale 200), or a 3-point better team won 70 % of the time.
 */
export const C = {
  possessionExp: 2,
  attackRate: 0.52,
  duelScale: 20,
  duelBias: 0,
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

/** Effective rating of each starter now: OVR − position + familiarity + chemistry + fatigue. */
function effective(t: TeamState, chem: boolean): number[] {
  const pts = chem
    ? chemistry(t.xi.map((x) => ({ player: x.player, pos: x.pos, role: x.role })))
    : null;
  return t.xi.map(
    (x, i) =>
      x.player.ovr -
      positionPenalty(x.player, x.pos) +
      familiarity(x.player, x.role) +
      (pts ? CHEM_MOD[pts[i] as 0 | 1 | 2 | 3] : 0) +
      fatigueMod(x.fit),
  );
}

type Units = {
  gk: number;
  def: number;
  mid: number;
  att: number;
  eff: number[];
  keeper: Live | null;
};

function units(t: TeamState, chem: boolean): Units {
  const eff = effective(t, chem);
  const sum = [0, 0, 0];
  const full = [0, 0, 0];
  let keeper: Live | null = null;
  let gk = 40;
  t.xi.forEach((x, i) => {
    const slotPos = formation(t.formation).slots[i]?.pos ?? x.pos;
    if (slotPos === "GK") {
      if (!x.off) {
        keeper = x;
        gk = eff[i] as number;
      }
      return;
    }
    const base = UNIT_WEIGHTS[slotPos];
    const sh = ROLE_SHIFT[x.role] ?? [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const w = Math.max(0, (base[k] as number) + (sh[k] as number));
      full[k] = (full[k] as number) + w;
      if (!x.off) sum[k] = (sum[k] as number) + w * (eff[i] as number);
    }
  });
  // Normalised by the full XI's weight: a red card lowers the unit.
  const [def, mid, att] = sum.map((s, k) => s / Math.max(0.5, full[k] as number)) as [
    number,
    number,
    number,
  ];
  return { gk, def, mid, att, eff, keeper };
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

const teamFrom = (s: TeamSheet): TeamState => {
  const slots = formation(s.formation).slots;
  return {
    formation: s.formation,
    xi: s.xi.map((x, i) => ({
      player: x.player,
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
    halves: 0,
    knockout: opts.knockout,
    chemistry: opts.chemistry,
    subsPerMatch: opts.subsPerMatch,
    pens: null,
    ballMinutes: [0, 0],
  };
}

/** Is the match over (90 minutes, or extra time and penalties in a knockout)? */
export function isFinished(m: MatchState): boolean {
  if (m.pens) return penaltiesDone(m.pens);
  if (m.halves < 2) return false;
  if (!m.knockout || m.score[0] !== m.score[1]) return true;
  return false; // level knockout: extra time, then penalties
}

/** The next thing to play: a half (1–4), or the shoot-out. */
export function nextPhase(m: MatchState): "half" | "penalties" | "over" {
  if (isFinished(m)) return "over";
  if (m.halves < 2) return "half";
  if (m.halves < 4) return "half";
  return "penalties";
}

export function winner(m: MatchState): Side | "draw" | null {
  if (!isFinished(m)) return null;
  if (m.pens) return m.pens.tally[0] > m.pens.tally[1] ? 0 : 1;
  return m.score[0] > m.score[1] ? 0 : m.score[1] > m.score[0] ? 1 : "draw";
}

/** Plays the next half (45 minutes, or 15 in extra time) and returns its events. */
export function playHalf(prev: MatchState, rng: Rng): { state: MatchState; events: MatchEvent[] } {
  const m = clone(prev);
  const half = m.halves + 1;
  const extra = half > 2;
  const start = half === 1 ? 0 : half === 2 ? 45 : half === 3 ? 90 : 105;
  const len = extra ? 15 : 45;
  const ev: MatchEvent[] = [];
  let o = 0;
  const push = (e: MatchEvent) => ev.push(e);
  push({ m: start, o: o++, t: half === 3 ? "et_start" : "kickoff" });
  const stoppage = 1 + rng.int(extra ? 2 : 4);
  let lastFail: Side | null = null;
  for (let minute = 1; minute <= len + stoppage; minute++) {
    const mm = start + Math.min(minute, len); // stoppage time shows as 45+ in the client
    const extraMin = Math.max(0, minute - len);
    const U = [units(m.teams[0], m.chemistry), units(m.teams[1], m.chemistry)] as const;
    // 1. Possession.
    const ta = possessionMult(m.teams[0].tactics);
    const tb = possessionMult(m.teams[1].tactics);
    const a = Math.pow(Math.max(1, U[0].mid), C.possessionExp) * ta;
    const b = Math.pow(Math.max(1, U[1].mid), C.possessionExp) * tb;
    const side: Side = u(rng) < a / (a + b) ? 0 : 1;
    const opp: Side = side === 0 ? 1 : 0;
    m.ballMinutes[side]++;
    const T = m.teams[side];
    const D = m.teams[opp];
    const tac = T.tactics;
    const dtac = D.tactics;
    // A foul by the side without the ball (pressing sides foul more).
    if (u(rng) < C.foulPerMin * (dtac.defence === "high_press" ? 1.15 : 1)) {
      foul(m, opp, side, rng, push, mm, () => o++, extraMin);
      fatigue(m, extraMin);
      continue;
    }
    // 2. An attacking move?
    const transition = lastFail === opp;
    let rate = C.attackRate * (1 + (tac.tempo - 50) * 0.004);
    if (dtac.defence === "high_press") rate *= 0.92;
    if (transition && tac.build === "counter") rate *= 1.15;
    lastFail = null;
    if (u(rng) >= rate) {
      fatigue(m, extraMin);
      continue;
    }
    // 3. Progress duel (direct balls skip the midfield; tactics terms shift the odds).
    const direct = tac.build === "long" && u(rng) < 0.2;
    let edge = (U[side].att - U[opp].def) / C.duelScale + C.duelBias;
    if (dtac.defence === "deep_block") edge -= 0.1;
    if (tac.build === "short") edge += 0.03;
    if (u(rng) >= sigmoid(edge)) {
      lastFail = side;
      fatigue(m, extraMin);
      continue;
    }
    // 4. Chance type.
    const kind = chanceKind(T, D, direct, rng);
    // Offside on through balls (their line, our runners' pace).
    if (kind === "through_ball" && u(rng) < C.offsideBase * (dtac.line / 50)) {
      const runner = shooter(T, U[side], rng);
      push({ m: mm, o: o++, t: "offside", team: side, player: runner.player.id });
      fatigue(m, extraMin);
      continue;
    }
    // 5–7. Shooter, assister, xG and the outcome.
    shoot(m, side, kind, transition, U, rng, push, mm, () => o++);
    // Corners from wide play that fails late, and from saves and blocks (inside shoot()).
    fatigue(m, extraMin);
  }
  m.halves = half;
  const endM = start + len;
  push({
    m: endM,
    o: o++,
    t: half === 1 ? "half_time" : half === 2 ? "full_time" : half === 3 ? "et_half" : "et_end",
  });
  const total = m.ballMinutes[0] + m.ballMinutes[1];
  if (total) {
    const p0 = Math.round((m.ballMinutes[0] / total) * 100);
    m.stats.possession = [p0, 100 - p0];
  }
  return { state: m, events: ev };
}

function fatigue(m: MatchState, _extraMin: number) {
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
  if (r < cross + through + 0.12) return "long_shot";
  return "build_up";
}

function onPitch(t: TeamState) {
  return t.xi.map((x, i) => ({ x, i })).filter(({ x }) => !x.off);
}

function shooter(t: TeamState, _U: Units, rng: Rng, header = false): Live {
  const slots = formation(t.formation).slots;
  const pool = onPitch(t).filter(({ x, i }) => (slots[i]?.pos ?? x.pos) !== "GK");
  return pick(rng, pool, ({ x, i }) => {
    const pos = slots[i]?.pos ?? x.pos;
    const w = (UNIT_WEIGHTS[pos][2] as number) + 0.05;
    const bias = header ? stat(x.player, "pow") / 70 : stat(x.player, "fin") / 70;
    return w * (SHOOT[x.role] ?? 1) * bias * bias;
  }).x;
}

function assister(t: TeamState, not: Live, rng: Rng): Live | undefined {
  const slots = formation(t.formation).slots;
  const pool = onPitch(t).filter(({ x, i }) => x !== not && (slots[i]?.pos ?? x.pos) !== "GK");
  if (!pool.length) return undefined;
  return pick(rng, pool, ({ x, i }) => {
    const pos = slots[i]?.pos ?? x.pos;
    const w = (UNIT_WEIGHTS[pos][1] as number) * 0.6 + (UNIT_WEIGHTS[pos][2] as number);
    return w * (CREATE[x.role] ?? 1) * (stat(x.player, "pas") / 70);
  }).x;
}

function shoot(
  m: MatchState,
  side: Side,
  kind: ChanceKind,
  transition: boolean,
  U: readonly [Units, Units],
  rng: Rng,
  push: (e: MatchEvent) => void,
  mm: number,
  next: () => number,
) {
  const opp: Side = side === 0 ? 1 : 0;
  const T = m.teams[side];
  const D = m.teams[opp];
  const header = kind === "cross" || kind === "corner" ? u(rng) < 0.6 : false;
  const shot = shooter(T, U[side], rng, header);
  const assist = kind === "long_shot" || kind === "free_kick" ? undefined : assister(T, shot, rng);
  if (kind !== "build_up")
    push({ m: mm, o: next(), t: "chance", team: side, kind, player: shot.player.id });
  // xG: the chance's base × quality (ATT vs DEF, and the stat that matters for this kind).
  let q = 1 + (U[side].att - U[opp].def) / C.qualityScale;
  if (kind === "through_ball")
    q *=
      1 +
      ((stat(shot.player, "spd") - avgStat(D, "spd")) / 10) *
        0.025 *
        ((D.tactics.line - 50) / 10 + 1);
  if (header) q *= 1 + (stat(shot.player, "pow") - avgStat(D, "pow")) / 100;
  if (transition && T.tactics.build === "counter") q *= D.tactics.line >= 65 ? 1.4 : 1.25;
  if (transition && D.tactics.defence === "high_press") q *= 1.15;
  if (T.tactics.build === "short") q *= 0.97;
  if (D.tactics.defence === "deep_block") q *= 0.85;
  q *= 1 - (T.tactics.tempo - 50) * 0.002;
  q *= 1 + (T.tactics.inBox - 3) * 0.04;
  if (transition) q *= 1 + (D.tactics.inBox - 3) * 0.06;
  if (kind === "through_ball" && D.xi.some((x) => !x.off && x.role === "sweeper_keeper")) q *= 0.9;
  const xg = clamp(C.xg[kind] * C.xgScale * q, 0.02, 0.65);
  m.stats.shots[side]++;
  m.stats.xg[side] += xg;
  const fin = header
    ? (stat(shot.player, "pow") + stat(shot.player, "fin")) / 2
    : stat(shot.player, "fin");
  const keeper = U[opp].keeper;
  const stp = keeper ? keeperStp(keeper.player) : 25;
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
    player: shot.player.id,
    ...(assist && result === "goal" ? { assist: assist.player.id } : {}),
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
      player: shot.player.id,
      ...(assist ? { assist: assist.player.id } : {}),
      score: [m.score[0], m.score[1]],
      ...(header ? { header: true } : {}),
    });
    return;
  }
  if (result === "saved" && keeper)
    push({
      m: mm,
      o: next(),
      t: "save",
      team: opp,
      keeper: keeper.player.id,
      player: shot.player.id,
    });
  // A corner from saves, blocks and wide play; sometimes it becomes a header chance.
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
      shoot(m, side, "corner", false, U, rng, push, mm, next);
  }
}

function avgStat(t: TeamState, k: keyof OutfieldStats) {
  const xs = t.xi.filter((x) => !x.off && GROUP[x.pos] === "DEF");
  if (!xs.length) return 60;
  return xs.reduce((a, x) => a + stat(x.player, k), 0) / xs.length;
}

function foul(
  m: MatchState,
  side: Side,
  victim: Side,
  rng: Rng,
  push: (e: MatchEvent) => void,
  mm: number,
  next: () => number,
  _extraMin: number,
) {
  const T = m.teams[side];
  const slots = formation(T.formation).slots;
  const pool = onPitch(T).filter(({ x, i }) => (slots[i]?.pos ?? x.pos) !== "GK");
  if (!pool.length) return;
  const offender = pick(rng, pool, ({ x, i }) => {
    const pos = slots[i]?.pos ?? x.pos;
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
  push({
    m: mm,
    o: next(),
    t: "foul",
    team: side,
    player: offender.player.id,
    ...(card ? { card } : {}),
  });
  // A foul in the final third: a free kick, sometimes a direct shot.
  if (u(rng) < C.freeKickShot) {
    push({ m: mm, o: next(), t: "free_kick", team: victim });
    const U = [units(m.teams[0], m.chemistry), units(m.teams[1], m.chemistry)] as const;
    shoot(m, victim, "free_kick", false, U, rng, push, mm, next);
  }
}

// ---- Changes between halves ----

export type Change =
  | { type: "sub"; off: string; on: string }
  | { type: "tactics"; tactics: Tactics }
  | { type: "role"; slot: number; role: Role; focus?: string }
  | { type: "formation"; formation: number; order?: string[] };

/** Why a change can't be made now, or null. */
export function whyNotChange(m: MatchState, side: Side, c: Change): string | null {
  const t = m.teams[side];
  const extraSubs = m.halves >= 2 ? 1 : 0; // one more in extra time
  if (c.type === "sub") {
    if (t.subsUsed >= m.subsPerMatch + extraSubs) return "No subs left";
    const out = t.xi.find((x) => x.player.id === c.off);
    if (!out || out.off) return "He isn't on the pitch";
    if (!t.bench.some((p) => p.id === c.on)) return "He isn't on the bench";
    return null;
  }
  if (c.type === "role") {
    const x = t.xi[c.slot];
    if (!x) return "No such slot";
    return null;
  }
  if (c.type === "formation") return formation(c.formation) ? null : "No such formation";
  return null;
}

/** Applies a half-time change (subs come on fresh in the same slot). */
export function applyChange(
  prev: MatchState,
  side: Side,
  c: Change,
  minute: number,
): { state: MatchState; events: MatchEvent[] } {
  const m = clone(prev);
  const t = m.teams[side];
  const ev: MatchEvent[] = [];
  if (c.type === "sub") {
    const i = t.xi.findIndex((x) => x.player.id === c.off);
    const on = t.bench.find((p) => p.id === c.on);
    const cur = t.xi[i];
    if (!cur || !on) return { state: m, events: ev };
    t.xi[i] = { ...cur, player: on, fit: 100, yellow: false };
    t.bench = t.bench.filter((p) => p.id !== c.on);
    t.gone.push(c.off);
    t.subsUsed++;
    ev.push({ m: minute, o: 0, t: "sub", team: side, off: c.off, on: c.on });
  } else if (c.type === "tactics") t.tactics = { ...c.tactics };
  else if (c.type === "role") {
    const x = t.xi[c.slot];
    if (x) {
      x.role = c.role;
      x.focus = c.focus ?? (ROLE_FOCUS[c.role][0] as string);
    }
  } else if (c.type === "formation") {
    const slots = formation(c.formation).slots;
    t.formation = c.formation;
    t.xi = t.xi.map((x, i) => ({ ...x, pos: (slots[i] as { pos: Position }).pos }));
  }
  return { state: m, events: ev };
}

// ---- Penalties ----

const penaltiesDone = (p: NonNullable<MatchState["pens"]>) => {
  const n = [0, 0];
  for (const k of p.kicks) n[k.team] = (n[k.team] as number) + 1;
  const [a, b] = p.tally;
  const [na, nb] = n as [number, number];
  if (na <= 5 && nb <= 5) {
    // Best of five: over when one side can't catch up.
    if (a > b + (5 - nb)) return true;
    if (b > a + (5 - na)) return true;
    return na === 5 && nb === 5 && a !== b;
  }
  return na === nb && a !== b;
};

/** The shoot-out: 5 each, alternating, then sudden death. Takers: best finishers first, keeper last. */
export function shootout(prev: MatchState, rng: Rng): { state: MatchState; events: MatchEvent[] } {
  const m = clone(prev);
  m.pens = { kicks: [], tally: [0, 0] };
  const ev: MatchEvent[] = [];
  const order = m.teams.map((t) =>
    t.xi
      .filter((x) => !x.off)
      .sort(
        (x, y) =>
          (x.pos === "GK" ? 1 : 0) - (y.pos === "GK" ? 1 : 0) ||
          stat(y.player, "fin") - stat(x.player, "fin"),
      ),
  ) as [Live[], Live[]];
  let o = 0;
  for (let k = 0; !penaltiesDone(m.pens) && k < 60; k++) {
    const side = (k % 2) as Side;
    const opp: Side = side === 0 ? 1 : 0;
    const takers = order[side];
    const taker = takers[Math.floor(k / 2) % takers.length] as Live;
    const keeper = m.teams[opp].xi.find((x) => x.pos === "GK" && !x.off) ?? order[opp][0];
    const sudden = k >= 10;
    const p = clamp(
      0.76 +
        0.004 * (stat(taker.player, "fin") - 75) -
        0.003 * ((keeper ? keeperStp(keeper.player) : 50) - 75) -
        (sudden ? 0.03 : 0),
      0.55,
      0.92,
    );
    const scored = u(rng) < p;
    if (scored) m.pens.tally[side]++;
    m.pens.kicks.push({ team: side, scored });
    ev.push({
      m: 120,
      o: o++,
      t: "pen",
      team: side,
      taker: taker.player.id,
      keeper: keeper?.player.id ?? "",
      scored,
      tally: [m.pens.tally[0], m.pens.tally[1]],
    });
  }
  return { state: m, events: ev };
}

/** Plays a whole match with no changes (tests and quick results). */
export function playMatch(
  state: MatchState,
  rng: Rng,
): { state: MatchState; events: MatchEvent[] } {
  let m = state;
  const all: MatchEvent[] = [];
  for (let guard = 0; guard < 6; guard++) {
    const next = nextPhase(m);
    if (next === "over") break;
    const r = next === "half" ? playHalf(m, rng) : shootout(m, rng);
    m = r.state;
    all.push(...r.events);
  }
  return { state: m, events: all };
}
