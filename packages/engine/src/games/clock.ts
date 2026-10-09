// Clocks shared by the two-player board games (chess, draughts): lichess-style lag compensation.
// Plain values only (no zod, no chess.js), so the browser can import it cheaply.

/** Minutes + seconds added per move; null = no clock (a per-move limit instead). */
export type TimeControl = { baseSeconds: number; incrementSeconds: number } | null;

/** Lichess-style lag compensation (scalachess LagTracker): forgive up to `quota` ms a move. */
export type LagTracker = { gain: number; quota: number; max: number };
export type ClockSide = { remainingMs: number; lag: LagTracker };

/** Most of the lag quota granted as grace when checking for a flag (lichess: up to 2 s). */
export const FLAG_GRACE_CAP_MS = 2000;

/**
 * Lag tracker at the start of a game (scalachess LagTracker.init): gain = min(1 s,
 * 0.4 % of the estimated game length + 0.15 s); the quota starts at 3× gain, caps at 7×.
 */
export function initLag(tc: NonNullable<TimeControl>): LagTracker {
  const est = tc.baseSeconds + 40 * tc.incrementSeconds;
  const gain = Math.min(1000, Math.round(est * 4 + 150));
  return { gain, quota: 3 * gain, max: 7 * gain };
}

export const newClockSide = (tc: NonNullable<TimeControl>): ClockSide => ({
  remainingMs: tc.baseSeconds * 1000,
  lag: initLag(tc),
});

/**
 * Charges a move to the mover's clock. `elapsed` is server time since their turn began;
 * `mt` the client's own think time (0 for a premove). The gap between them is lag, of which
 * at most the current quota is forgiven; the quota then refills by `gain` (capped).
 */
export function chargeMove(
  side: ClockSide,
  elapsed: number,
  mt: number | undefined,
  incrementMs: number,
): ClockSide {
  const clientMt = Math.min(Math.max(mt ?? elapsed, 0), elapsed);
  const lag = elapsed - clientMt;
  const comp = Math.min(lag, side.lag.quota);
  const quota = Math.min(side.lag.quota + side.lag.gain - comp, side.lag.max);
  const moveTime = Math.max(0, elapsed - comp);
  return {
    remainingMs: side.remainingMs - moveTime + incrementMs,
    lag: { ...side.lag, quota },
  };
}

/** The flag time of a running clock: its time left plus up to 2 s of the lag quota as grace. */
export const flagAt = (turnStartedAt: number, c: ClockSide) =>
  turnStartedAt + c.remainingMs + Math.min(c.lag.quota, FLAG_GRACE_CAP_MS);

export const timeLabel = (tc: TimeControl) =>
  tc ? `${tc.baseSeconds / 60}+${tc.incrementSeconds}` : "No clock";
