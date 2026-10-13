import { describe, expect, it } from "vitest";
import { DEFAULT_TACTICS, type MatchEvent, type TeamSheet } from "./match";
import { momentum, playerRatings, ratingDeltas, whyLines } from "./report";

const sheet = (p: string): TeamSheet => ({
  formation: 4,
  xi: Array.from({ length: 11 }, (_, i) => ({ id: `${p}${i}`, role: "stopper" as never })),
  bench: [`${p}s`],
  tactics: { ...DEFAULT_TACTICS },
});
const teams = [sheet("h"), sheet("a")] as const;
const defenders = [
  ["h1", "h2", "h3", "h4"],
  ["a1", "a2", "a3", "a4"],
] as const;
const log: MatchEvent[] = [
  { m: 0, o: 0, t: "kickoff" },
  { m: 10, o: -1, t: "ball", team: 0, zone: 2 },
  { m: 10, o: 0, t: "chance", team: 0, kind: "cross", player: "h9", assist: "h7" },
  { m: 10, o: 1, t: "shot", team: 0, player: "h9", xg: 0.4, result: "goal" },
  { m: 10, o: 2, t: "goal", team: 0, player: "h9", assist: "h7", score: [1, 0] },
  { m: 30, o: -1, t: "ball", team: 1, zone: 2 },
  { m: 30, o: 0, t: "chance", team: 1, kind: "through_ball", player: "a9" },
  { m: 30, o: 1, t: "shot", team: 1, player: "a9", xg: 0.2, result: "saved" },
  { m: 30, o: 2, t: "save", team: 0, keeper: "h0", player: "a9" },
  { m: 40, o: 0, t: "foul", team: 1, player: "a5", card: "red" },
  { m: 60, o: 900, t: "sub", team: 0, off: "h10", on: "hs" },
  { m: 62, o: 0, t: "chance", team: 0, kind: "cross", player: "hs", assist: "h7" },
  { m: 62, o: 1, t: "shot", team: 0, player: "hs", xg: 0.3, result: "goal" },
  { m: 62, o: 2, t: "goal", team: 0, player: "hs", assist: "h7", score: [2, 0] },
  { m: 75, o: 0, t: "chance", team: 0, kind: "cross", player: "h8", assist: "h6" },
];

describe("match report", () => {
  it("ratings: scorers and creators up, red cards down, clean sheet and result counted", () => {
    const d = ratingDeltas(log);
    expect(d.h9).toBeCloseTo(1.05, 5);
    expect(d.h7).toBeCloseTo(1.4, 5);
    expect(d.a5).toBeCloseTo(-1.2, 5);
    const r = Object.fromEntries(playerRatings(log, teams, defenders).map((p) => [p.id, p]));
    expect(r.h7?.rating).toBeGreaterThan(r.h5?.rating ?? 0);
    expect(r.h0?.rating).toBeCloseTo(6.4 + 0.35 + 0.6 + 0.2, 1); // save, clean sheet, win
    expect(r.h1?.rating).toBeCloseTo(6.4 + 0.3 + 0.2, 1);
    expect(r.hs?.sub).toBe(true);
    expect(r.a5?.rating).toBeLessThan(5.5);
  });

  it("momentum: on top when attacking, goals marked", () => {
    const mo = momentum(log);
    expect(mo.buckets[1]).toBeGreaterThan(0); // minute 10 is home's
    expect(mo.buckets[5]).toBeLessThan(0); // minute 30 is away's
    expect(mo.goals).toEqual([
      { bucket: 1, side: 0 },
      { bucket: 12, side: 0 },
    ]);
  });

  it("why: chances, where they came from, the change that turned it, the red card", () => {
    const why = whyLines(log, 0);
    expect(why[0]).toMatch(/better chances/);
    expect(why.join(" ")).toMatch(/change at 60'/);
    expect(why.join(" ")).toMatch(/They were down to ten from 40'/);
    expect(why.length).toBeLessThanOrEqual(4);
    // Without the turning points there's room for where the chances came from.
    const plain = whyLines(
      log.filter((e) => e.t !== "foul" && e.t !== "sub"),
      0,
    );
    expect(plain.join(" ")).toMatch(/Most of your chances came from crosses/);
  });
});
