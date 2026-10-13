// Football playback: when each event of the current half shows, and the score, clock and ticker
// from what's been shown so far. The view runs up to 3 minutes ahead of the screen, so nothing
// here may read the live score or stats directly (no spoilers).
import {
  PEN_MS,
  PLAYBACK_SLACK_MINUTES,
  type MatchEvent,
  type MatchStats,
} from "@gamehub/engine/football";

export type Timed = { e: MatchEvent; at: number };

const SEGMENT_START = new Set(["kickoff", "et_start"]);
const HALF_START = [0, 0, 45, 90, 105];

/** Where the current segment (half or shoot-out) starts in the log. */
export function segmentStart(log: readonly MatchEvent[]): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i] as MatchEvent;
    if (SEGMENT_START.has(e.t)) return i;
    if (e.t === "pen" && (i === 0 || (log[i - 1] as MatchEvent).t !== "pen")) return i;
  }
  return 0;
}

/** Highlights: how far ahead of the real clock quiet minutes may run (the server sends 3). */
const AHEAD_MINUTES = 1.5;

/** Moments worth reading: a minute with one of these plays slower on screen. */
const BUSY = new Set(["chance", "shot", "goal", "save", "corner", "offside", "free_kick"]);

/**
 * Times for every event: earlier segments are already shown (time 0); in this one, each "ball"
 * event opens a match minute and the minute's other events are spread across it; penalties come
 * one every PEN_MS. A minute with an attack in it gets up to twice the time so the build-up can
 * be read, as long as the screen stays within PLAYBACK_SLACK_MINUTES of the real clock; the
 * quiet minutes after it run shorter until it has caught up.
 *
 * Highlights (a room rule, on by default): quiet minutes run at under half time, banking up to
 * AHEAD_MINUTES ahead of the real clock (the server is always 3 minutes ahead, so those minutes
 * are here), and a minute with an attack spends the bank: up to three times as long.
 */
export function schedule(
  log: readonly MatchEvent[],
  startedAt: number,
  perMinute: number,
  highlights = false,
): Timed[] {
  const from = segmentStart(log);
  const out: Timed[] = log.slice(0, from).map((e) => ({ e, at: 0 }));
  const seg = log.slice(from);
  if (seg[0]?.t === "pen") {
    seg.forEach((e, k) => out.push({ e, at: startedAt + (k + 1) * PEN_MS }));
    return out;
  }
  const slack = PLAYBACK_SLACK_MINUTES * perMinute;
  let minute = 0;
  let t = startedAt;
  let i = 0;
  while (i < seg.length) {
    const e = seg[i] as MatchEvent;
    if (e.t !== "ball") {
      // Kickoff before the first minute; the half's end after the last.
      out.push({ e, at: t });
      i++;
      continue;
    }
    let j = i + 1;
    while (j < seg.length && seg[j]?.t !== "ball" && !isEnd(seg[j] as MatchEvent)) j++;
    const inside = seg.slice(i + 1, j);
    // How far behind the real clock the screen is (negative: ahead).
    const behind = t - (startedAt + minute * perMinute);
    const busy = inside.some((x) => BUSY.has(x.t));
    const dur = highlights
      ? busy
        ? perMinute + Math.min(perMinute * 2, Math.max(0, slack - behind))
        : // Gain time, but never past AHEAD_MINUTES ahead.
          Math.max(perMinute * 0.45, perMinute - Math.max(0, AHEAD_MINUTES * perMinute + behind))
      : busy
        ? perMinute + Math.min(perMinute, Math.max(0, slack - behind))
        : Math.max(perMinute * 0.55, perMinute - behind);
    out.push({ e, at: t });
    inside.forEach((x, k) => out.push({ e: x, at: t + ((k + 1) * dur) / (inside.length + 1) }));
    t += dur;
    minute++;
    i = j;
  }
  return out;
}

const isEnd = (e: MatchEvent) =>
  e.t === "half_time" || e.t === "full_time" || e.t === "et_half" || e.t === "et_end";

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
