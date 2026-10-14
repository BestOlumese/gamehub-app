import { DEFAULT_TACTICS, type MatchEvent, type TeamSheet } from "@gamehub/engine/football";
import { describe, expect, it } from "vitest";
import { cardAt, leavingAt, lineupAt, RED_OFF_MS, shapeSpot } from "./live-play";
import type { Timed } from "./playback";

const sheet = (p: string): TeamSheet => ({
  formation: 4, // 4-4-2
  xi: Array.from({ length: 11 }, (_, i) => ({ id: `${p}${i}`, role: "stopper" as never })),
  bench: [`${p}s`],
  tactics: { ...DEFAULT_TACTICS },
});
const T = (e: MatchEvent, at: number): Timed => ({ e, at });
const MIN = 900;
const ko = T({ m: 0, o: 0, t: "kickoff" }, 0);
const ball = (m: number, team: 0 | 1, zone: 0 | 1 | 2) =>
  T({ m, o: -1, t: "ball", team, zone }, m * MIN);

describe("live viewer helpers", () => {
  it("subs and red cards: nobody comes on early, and a sent-off player is never found again", () => {
    const now = [
      { ...sheet("h"), xi: sheet("h").xi.map((x, i) => (i === 9 ? { ...x, id: "hs" } : x)) },
      sheet("a"),
    ] as const;
    const log = [
      ko,
      ball(1, 0, 1),
      T({ m: 1, o: 1, t: "foul", team: 0, player: "h3", card: "red" }, MIN + 300),
      T({ m: 2, o: 900, t: "sub", team: 0, off: "h9", on: "hs" }, 5000),
      ...Array.from({ length: 20 }, (_, k) => ball(k + 2, 0, (k % 3) as 0 | 1 | 2)),
    ];
    expect(lineupAt(log, now, 200).ids[0]).toContain("h9");
    expect(lineupAt(log, now, 5100).ids[0]).toContain("hs");
    expect(lineupAt(log, now, MIN + 400).ids[0]).toContain("h3");
    expect(cardAt(log, MIN + 400)).toEqual({ id: "h3", colour: "red" });
    expect(lineupAt(log, now, 9000).ids[0]).not.toContain("h3");
    // He walks off with his red ring for a few seconds, then he's gone.
    expect(leavingAt(log, MIN + 300 + 2500)).toEqual(new Set(["h3"]));
    expect(cardAt(log, MIN + 300 + 2500)).toEqual({ id: "h3", colour: "red" });
    expect(lineupAt(log, now, MIN + 300 + 2500).ids[0]).toContain("h3");
    expect(leavingAt(log, MIN + 300 + RED_OFF_MS + 10).size).toBe(0);
  });

  it("shape: a side pushes up as the ball goes forward and drops back when it's theirs", () => {
    const slot = { pos: "CB" as const, x: 38, y: 20 };
    const t = DEFAULT_TACTICS;
    const deep = shapeSpot(0, slot, t, "open", { x: 30, y: 50 }, 0, null);
    const high = shapeSpot(0, slot, t, "open", { x: 80, y: 50 }, 0, null);
    expect(high.x).toBeGreaterThan(deep.x + 20);
    const defending = shapeSpot(1, slot, t, "open", { x: 85, y: 50 }, 0, null);
    expect(defending.x).toBeGreaterThan(85); // the away side defends the right-hand goal
    // They shift across towards the ball.
    const top = shapeSpot(1, slot, t, "open", { x: 70, y: 10 }, 0, null);
    const bottom = shapeSpot(1, slot, t, "open", { x: 70, y: 90 }, 0, null);
    expect(bottom.y).toBeGreaterThan(top.y + 15);
  });
});
