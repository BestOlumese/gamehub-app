import { timeline, type Card, type MatchEvent, type TeamSheet } from "@gamehub/engine/football";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../../../../packages/engine/src/rng";
import { autoDraft, makePool } from "../../../../../packages/engine/src/games/football/draft";
import { playMatch, startMatch } from "../../../../../packages/engine/src/games/football/match";
import { lookupOf, sheetOf } from "../../../../../packages/engine/src/games/football/sheets";
import { testDataset } from "../../../../../packages/engine/src/games/football/test-data";
import { H, LiveSim, W } from "./live-sim";
import type { Timed } from "./playback";

const pool = makePool(testDataset);
const get = lookupOf(pool);
/** Two sides with no player in both (as in a real draft). */
function pair(seed: number): [TeamSheet, TeamSheet] {
  const draft = (t: number, from: typeof pool) =>
    sheetOf(
      autoDraft((k) => seededRng(`ls:${t}:${k}`), from, "balanced"),
      pool,
    );
  const a = draft(seed, pool);
  const taken = new Set([...a.xi.map((x) => x.id), ...a.bench]);
  const rest = makePool({
    ...testDataset,
    players: testDataset.players.filter((p) => !taken.has(p.id)),
  });
  return [a, draft(seed + 77, rest)];
}
const cards = Object.fromEntries(testDataset.players.map((p) => [p.id, p as unknown as Card]));
const timing = { halfMs: 60_000, highlights: true };

/** Runs one half through the sim at 30 frames a second; calls `check` every frame. */
function runHalf(seed: number, check: (o: ReturnType<typeof frameInfo>) => void) {
  const [a, b] = pair(seed);
  const r = playMatch(
    startMatch(a, b, { knockout: false, chemistry: true, subsPerMatch: 5 }),
    (k) => seededRng(`lsm:${seed}:${k}`),
    get,
  );
  const ht = r.events.findIndex((e) => e.t === "half_time");
  const seg: MatchEvent[] = r.events.slice(0, ht + 1);
  const tl = timeline(seg, 0, timing);
  const timed: Timed[] = tl.events.map((x) => ({ e: x.e, at: x.at }));
  const sim = new LiveSim();
  const o = {
    tl,
    timed,
    kick: [a, b] as const,
    current: [a, b] as const,
    cards,
    fit: null,
    mySide: 0 as const,
    reduce: false,
  };
  for (let at = 0; at <= tl.end; at += 1000 / 30) {
    const f = sim.update(at, o);
    check(frameInfo(f, at, tl, sim));
  }
  return { tl, seg };
}
const frameInfo = (
  f: ReturnType<LiveSim["update"]>,
  at: number,
  tl: ReturnType<typeof timeline>,
  sim: LiveSim,
) => ({ f, at, tl, sim });

describe("live 2D simulation", () => {
  it(
    "physical: no NaN, everyone on (or just off) the pitch, nobody faster than his top speed",
    { timeout: 120_000 },
    () => {
      // Plain checks per frame (expect() per player per frame made this the slowest test).
      const bad: string[] = [];
      for (const seed of [1, 2, 3]) {
        runHalf(seed, ({ f, at }) => {
          for (const p of f.players) {
            const ok =
              Number.isFinite(p.x) &&
              Number.isFinite(p.y) &&
              p.x > -4 &&
              p.x < W + 4 &&
              p.y > -4 &&
              p.y < H + 4 &&
              Math.hypot(p.vx, p.vy) <= p.vmax + 1e-6;
            if (!ok && bad.length < 5)
              bad.push(`seed ${seed} at ${at}: ${p.id} ${JSON.stringify(p)}`);
          }
          if (!(Number.isFinite(f.ball.x) && Number.isFinite(f.ball.y)) && bad.length < 5)
            bad.push(`seed ${seed} at ${at}: ball ${JSON.stringify(f.ball)}`);
        });
      }
      expect(bad).toEqual([]);
    },
  );

  it("goals: when the commentary says GOAL the ball is in that net", () => {
    let goals = 0;
    for (const seed of [4, 5, 6, 7, 8, 9]) {
      // One pass: where the ball is 60 ms after each goal.
      const seen = new Map<number, number>();
      const { tl } = runHalf(seed, ({ f, at, tl }) => {
        for (const x of tl.events)
          if (x.e.t === "goal" && at >= x.at + 60 && !seen.has(x.at)) seen.set(x.at, f.ball.x);
      });
      for (const x of tl.events) {
        if (x.e.t !== "goal") continue;
        const ballX = seen.get(x.at) ?? null;
        goals++;
        expect(ballX).not.toBeNull();
        if (x.e.team === 0) expect(ballX).toBeGreaterThan(W - 1);
        else expect(ballX).toBeLessThan(1);
      }
    }
    expect(goals).toBeGreaterThan(0);
  }, 120_000);

  it(
    "passes reach their man, and the ball never jumps (except kickoffs and set pieces)",
    { timeout: 60_000 },
    () => {
      let near = 0;
      let total = 0;
      let jumps = 0;
      let prev: { x: number; y: number; s: number } | null = null;
      runHalf(11, ({ f, at, tl, sim }) => {
        const S = sim.simTime(tl, at);
        if (prev && S > prev.s) {
          // Faster than any real ball (40 m/s) in match time is a jump.
          const v = Math.hypot(f.ball.x - prev.x, f.ball.y - prev.y) / (S - prev.s);
          if (v > 40) jumps++;
        }
        prev = { x: f.ball.x, y: f.ball.y, s: S };
        if (f.carrier) {
          const p = f.players.find((x) => x.id === f.carrier);
          if (p) {
            total++;
            if (Math.hypot(p.x - f.ball.x, p.y - f.ball.y) < 2.5) near++;
          }
        }
      });
      expect(near / total).toBeGreaterThan(0.9);
      expect(jumps).toBeLessThan(25);
    },
  );
});
