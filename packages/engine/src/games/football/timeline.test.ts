import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import { autoDraft, makePool } from "./draft";
import { playMatch, startMatch, type MatchEvent } from "./match";
import { lookupOf, sheetOf } from "./sheets";
import { testDataset } from "./test-data";
import { segmentStart, timeline } from "./timeline";

const pool = makePool(testDataset);
const get = lookupOf(pool);
const opts = { knockout: false, chemistry: true, subsPerMatch: 5 };
const team = (t: number) =>
  sheetOf(
    autoDraft((k) => seededRng(`tl:${t}:${k}`), pool, "balanced"),
    pool,
  );

/** The two halves of a full match's log. */
function halves(log: readonly MatchEvent[]): MatchEvent[][] {
  const ht = log.findIndex((e) => e.t === "half_time");
  return [log.slice(0, ht + 1), log.slice(ht + 1)];
}

describe("highlights timeline", () => {
  const HALF = 60_000;
  const lengths: number[] = [];
  for (let i = 0; i < 40; i++) {
    const r = playMatch(
      startMatch(team(i), team(i + 50), opts),
      (k) => seededRng(`tlm:${i}:${k}`),
      get,
    );
    for (const seg of halves(r.events)) {
      const tl = timeline(seg.slice(segmentStart(seg)), 0, { halfMs: HALF, highlights: true });
      lengths.push(tl.end);
      it(`match ${i}: in order, attacks at real speed or a little faster`, () => {
        for (let k = 1; k < tl.events.length; k++)
          expect((tl.events[k] as { at: number }).at).toBeGreaterThanOrEqual(
            (tl.events[k - 1] as { at: number }).at - 1e-6,
          );
        for (const m of tl.minutes) {
          if (m.busy) {
            expect(m.scale).toBeGreaterThanOrEqual(1);
            expect(m.scale).toBeLessThanOrEqual(1.6);
          } else expect(m.dur).toBeGreaterThanOrEqual(150);
        }
        // Chance, then shot, then goal.
        const at = (e: MatchEvent) => tl.events.find((x) => x.e === e)?.at ?? 0;
        seg.forEach((e, n) => {
          if (e.t !== "goal") return;
          const shot = [...seg.slice(0, n)].reverse().find((x) => x.t === "shot");
          if (shot) expect(at(shot)).toBeLessThan(at(e));
        });
      });
    }
  }
  it("halves land near the host's target", () => {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    expect(mean).toBeGreaterThan(HALF * 0.8);
    expect(mean).toBeLessThan(HALF * 1.25);
    for (const l of lengths) expect(l).toBeLessThan(HALF * 1.6);
  });
});
