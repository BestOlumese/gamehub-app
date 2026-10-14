// The match's screen time (decided with Best, Oct 2026: "highlights timeline"). Attacks play at
// real speed with their whole build-up; quiet minutes fast-forward; the host's half length is
// a target the timeline steers towards. The server and every phone run this same pure
// function on the same events, so commentary, score and the 2D pitch stay exactly in step.
import type { MatchEvent } from "./match";
import type { Touch, TouchKind } from "./paths";

/** Seconds the ball takes to reach a player, by how it was played (real football speeds). */
export const TRAVEL: Record<TouchKind, number> = {
  k: 0.8, // kickoff, a short pass back
  g: 1.2, // the keeper rolls or throws it out
  w: 0.6, // won it back
  p: 0.9, // a pass along the ground
  l: 1.6, // a long ball in the air
  t: 1.1, // a ball in behind
  c: 1.3, // a cross
  d: 1.4, // carrying it himself
};
/** How long the man on the ball takes before he plays it on. */
const HOLD = 0.5;
/** Strike, flight, aftermath (seconds). */
const STRIKE = 0.35;
const FLIGHT = 0.5;
const CELEBRATE = 3;
const PEN_MS = 1500;

export type TimedTouch = { id: string; how: TouchKind; kick: number; arrive: number };
export type Minute = {
  /** Index of its "ball" event in the segment. */
  ball: number;
  /** Real time it starts (ms) and lasts (ms). */
  start: number;
  dur: number;
  /** Sim seconds it covers. */
  sim: number;
  /**
   * Two speeds (sim seconds per real second): `ff` up to sim second `cut` (fast-forward through
   * a quiet stretch or an early build-up), then `scale` (1 = real speed) for the scene.
   */
  cut: number;
  ff: number;
  scale: number;
  /** An attack (a scene) rather than a quiet minute. */
  busy: boolean;
  /** The build-up with sim times (seconds from the minute's start). */
  touches: TimedTouch[];
};
export type Timed = { e: MatchEvent; at: number; sim: number };
export type Timeline = { events: Timed[]; minutes: Minute[]; end: number };

const BUSY = new Set(["chance", "shot", "goal", "corner", "free_kick", "offside"]);
const END = new Set(["half_time", "full_time", "et_half", "et_end"]);
const START = new Set(["kickoff", "et_start"]);

/** Where the current segment (half or shoot-out) starts in the log. */
export function segmentStart(log: readonly MatchEvent[]): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i] as MatchEvent;
    if (START.has(e.t)) return i;
    if (e.t === "pen" && (i === 0 || (log[i - 1] as MatchEvent).t !== "pen")) return i;
  }
  return 0;
}

/** A minute's touches with their sim times, and when the build-up is over. */
export function touchTimes(path: readonly Touch[]): { touches: TimedTouch[]; end: number } {
  const touches: TimedTouch[] = [];
  let t = 0;
  path.forEach(([id, how], i) => {
    const kick = i === 0 ? 0 : how === "d" ? t : t + HOLD;
    const arrive = kick + TRAVEL[how];
    touches.push({ id, how, kick, arrive });
    t = arrive;
  });
  return { touches, end: t };
}

/** Each event's sim time within its minute, and the minute's sim length. */
function minuteEvents(
  inside: readonly MatchEvent[],
  touches: TimedTouch[],
  pathEnd: number,
): { at: number[]; sim: number } {
  let cur = pathEnd;
  let usedChance = false;
  // How long the shot flies: from distance or a free kick longer, a header shorter.
  let flight = FLIGHT;
  const at = inside.map((e) => {
    switch (e.t) {
      case "chance": {
        flight =
          e.kind === "long_shot" || e.kind === "free_kick"
            ? 0.9
            : e.kind === "cross" || e.kind === "corner"
              ? 0.45
              : 0.6;
        if (!usedChance && e.kind !== "corner" && e.kind !== "free_kick") {
          usedChance = true;
          // When the final ball is played to him.
          const last = [...touches].reverse().find((x) => x.id === e.player && x.how !== "d");
          return last ? last.kick : cur;
        }
        const t = cur + 0.3;
        cur = t + (e.kind === "corner" ? 1.3 : 0.8);
        return t;
      }
      case "shot": {
        const t = Math.max(cur, pathEnd) + STRIKE;
        cur =
          t +
          (e.result === "goal" || e.result === "saved" ? 0 : e.result === "blocked" ? 0.4 : 0.8);
        return t;
      }
      case "goal": {
        const t = cur + flight;
        cur = t + CELEBRATE;
        return t;
      }
      case "save": {
        const t = cur + flight;
        cur = t + 1;
        return t;
      }
      case "corner": {
        const t = cur + 0.6;
        cur = t + 1.8;
        return t;
      }
      case "foul": {
        const t = cur + 0.3;
        cur = t + (e.card ? 2.4 : 1.1);
        return t;
      }
      case "free_kick": {
        const t = cur;
        cur = t + 1.6;
        return t;
      }
      case "offside": {
        const t = pathEnd;
        cur = Math.max(cur, t + 1.2);
        return t;
      }
      default:
        return cur;
    }
  });
  return { at, sim: Math.max(cur, pathEnd) + 0.2 };
}

/**
 * Real times for a segment. `halfMs`: the host's target for a 45-minute half (extra-time halves
 * aim for a third of it); `highlights` off: every minute takes the same time.
 */
export function timeline(
  seg: readonly MatchEvent[],
  startedAt: number,
  o: { halfMs: number; highlights: boolean },
): Timeline {
  const events: Timed[] = [];
  const minutes: Minute[] = [];
  if (seg[0]?.t === "pen") {
    seg.forEach((e, k) => events.push({ e, at: startedAt + (k + 1) * PEN_MS, sim: 0 }));
    return { events, minutes, end: startedAt + (seg.length + 1) * PEN_MS };
  }
  const extra = seg[0]?.t === "et_start";
  const length = extra ? 15 : 45;
  const target = extra ? o.halfMs / 3 : o.halfMs;
  const per = target / length;
  let t = startedAt;
  let i = 0;
  while (i < seg.length) {
    const e = seg[i] as MatchEvent;
    if (e.t !== "ball") {
      // Kickoff before the first minute (a beat to read it); the half's end after the last.
      events.push({ e, at: t, sim: 0 });
      if (START.has(e.t)) t += 600;
      i++;
      continue;
    }
    let j = i + 1;
    while (j < seg.length && seg[j]?.t !== "ball" && !END.has((seg[j] as MatchEvent).t)) j++;
    const inside = seg.slice(i + 1, j);
    const { touches, end } = touchTimes(e.path ?? []);
    const { at, sim } = minuteEvents(inside, touches, end);
    const busy = inside.some((x) => BUSY.has(x.t));
    const goal = inside.some((x) => x.t === "goal");
    // Steer towards the target: behind it, quiet minutes fly faster and scenes speed up a little.
    const k = minutes.length;
    const dev = (t - startedAt - k * per) / target;
    const ffSpeed = Math.min(30, Math.max(2.5, 4 * 2 ** (dev / 0.1)));
    const sceneSpeed = Math.min(1.6, Math.max(1, 2 ** (dev / 0.25)));
    // A goal plays its whole build-up at real speed; other attacks only the last two touches on.
    const cut = !busy ? sim : goal ? 0 : (touches[Math.max(0, touches.length - 2)]?.kick ?? 0);
    let ff = ffSpeed;
    let scale = sceneSpeed;
    if (!o.highlights) {
      ff = scale = (sim * 1000) / per;
    }
    const real = (s: number) => (s <= cut ? s / ff : cut / ff + (s - cut) / scale) * 1000;
    const dur = Math.max(busy ? 0 : 150, real(sim));
    minutes.push({ ball: events.length, start: t, dur, sim, cut, ff, scale, busy, touches });
    events.push({ e, at: t, sim: 0 });
    inside.forEach((x, n) => {
      const s = at[n] as number;
      events.push({ e: x, at: t + real(s), sim: s });
    });
    t += dur;
    i = j;
  }
  return { events, minutes, end: t };
}

/** The minute on screen at real time `now` (or null before the first). */
export function minuteAt(tl: Timeline, now: number): Minute | null {
  let lo = 0;
  let hi = tl.minutes.length - 1;
  let found: Minute | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = tl.minutes[mid] as Minute;
    if (m.start <= now) {
      found = m;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Sim seconds into minute `m` at real time `now`. */
export function simAt(m: Minute, now: number): number {
  const real = Math.max(0, now - m.start) / 1000;
  const cutReal = m.cut / m.ff;
  return Math.min(m.sim, real <= cutReal ? real * m.ff : m.cut + (real - cutReal) * m.scale);
}
