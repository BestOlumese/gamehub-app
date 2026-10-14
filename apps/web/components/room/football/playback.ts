// Football playback: when each event shows, and the score, clock and ticker from what's been
// shown so far. Times come from the shared timeline (`timeline.ts` in the engine), the same one
// the server plays by, so the phone never drifts. The view runs a few seconds ahead of the
// screen, so nothing here may read the live score or stats directly (no spoilers).
import {
  segmentStart,
  timeline,
  type MatchEvent,
  type MatchStats,
  type Timeline,
} from "@gamehub/engine/football";

export type Timed = { e: MatchEvent; at: number };
export type Timing = { halfMs: number; highlights: boolean };

const HALF_START = [0, 0, 45, 90, 105];

/** Times for every event: earlier segments are already shown (time 0); this one by the timeline. */
export function schedule(
  log: readonly MatchEvent[],
  startedAt: number,
  timing: Timing,
): { timed: Timed[]; tl: Timeline } {
  const from = segmentStart(log);
  const tl = timeline(log.slice(from), startedAt, timing);
  return {
    timed: [
      ...log.slice(0, from).map((e) => ({ e, at: 0 })),
      ...tl.events.map((x) => ({ e: x.e, at: x.at })),
    ],
    tl,
  };
}

export const shown = (timed: readonly Timed[], now: number) =>
  timed.filter((t) => t.at <= now).map((t) => t.e);

/** Score from the goals shown (all goals stay in the log), plus the shoot-out tally. */
export function scoreOf(events: readonly MatchEvent[]): {
  score: [number, number];
  pens: [number, number] | null;
} {
  const score: [number, number] = [0, 0];
  let pens: [number, number] | null = null;
  for (const e of events) {
    if (e.t === "goal") score[e.team]++;
    if (e.t === "pen") pens = [e.tally[0], e.tally[1]];
  }
  return { score, pens };
}

/** The clock: "34'", "45+2'", "HT", "FT"… from what's shown. */
export function clockOf(events: readonly MatchEvent[], half: number): string {
  const last = events.at(-1);
  if (!last) return "0'";
  if (last.t === "half_time") return "HT";
  if (last.t === "full_time") return "FT";
  if (last.t === "et_half") return "ET HT";
  if (last.t === "et_end") return "AET";
  if (last.t === "pen") return "Pens";
  const balls = events.filter((e) => e.t === "ball");
  const cap = (HALF_START[half] ?? 0) + (half > 2 ? 15 : 45);
  const lastBall = balls.at(-1);
  if (!lastBall) return `${HALF_START[half] ?? 0}'`;
  if (lastBall.m < cap) return `${lastBall.m}'`;
  // Stoppage time: minutes at the cap after the first one.
  const atCap = balls.filter((b) => b.m === cap).length;
  return atCap > 1 ? `${cap}+${atCap - 1}'` : `${cap}'`;
}

/** The ticker: stats at the half's start plus what's been shown since. */
export function statsOf(base: MatchStats, events: readonly MatchEvent[], half: number): MatchStats {
  const s: MatchStats = JSON.parse(JSON.stringify(base)) as MatchStats;
  const seg = events.slice(segmentStart(events));
  const balls = [0, 0];
  for (const e of seg) {
    if (e.t === "shot") {
      s.shots[e.team]++;
      s.xg[e.team] += e.xg;
      if (e.result === "goal" || e.result === "saved") s.onTarget[e.team]++;
    } else if (e.t === "corner") s.corners[e.team]++;
    else if (e.t === "foul") {
      s.fouls[e.team]++;
      if (e.card === "yellow" || e.card === "second_yellow") s.yellows[e.team]++;
      if (e.card === "red" || e.card === "second_yellow") s.reds[e.team]++;
    } else if (e.t === "ball") balls[e.team] = (balls[e.team] ?? 0) + 1;
  }
  const now = (balls[0] ?? 0) + (balls[1] ?? 0);
  const before = Math.max(0, half - 1) * 45;
  if (now)
    s.possession[0] = Math.round(
      (base.possession[0] * before + ((balls[0] ?? 0) / now) * 100 * now) / (before + now),
    );
  s.possession[1] = 100 - s.possession[0];
  return s;
}

/**
 * The match clock: real time, frozen during a timeout. When it ends the server moves the
 * match's start on by the time paused; until it has, this does the same sum on the phone.
 */
export function matchNow(
  now: number,
  pause: { at: number; until: number } | null | undefined,
): number {
  if (!pause) return now;
  return now < pause.until ? Math.min(now, pause.at) : now - (pause.until - pause.at);
}
