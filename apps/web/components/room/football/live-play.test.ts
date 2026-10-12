import { DEFAULT_TACTICS, PEN_MS, type MatchEvent, type TeamSheet } from "@gamehub/engine/football";
import { describe, expect, it } from "vitest";
import {
  cardAt,
  celebrationMs,
  latest,
  lineupAt,
  planPlay,
  shapeSpot,
  type Beat,
} from "./live-play";
import type { Timed } from "./playback";

const sheet = (p: string): TeamSheet => ({
  formation: 4, // 4-4-2
  xi: Array.from({ length: 11 }, (_, i) => ({ id: `${p}${i}`, role: "stopper" as never })),
  bench: [`${p}s`],
  tactics: { ...DEFAULT_TACTICS },
});
const both = [sheet("h"), sheet("a")] as const;
const T = (e: MatchEvent, at: number): Timed => ({ e, at });
const MIN = 900;
const ko = T({ m: 0, o: 0, t: "kickoff" }, 0);
const ball = (m: number, team: 0 | 1, zone: 0 | 1 | 2) =>
  T({ m, o: -1, t: "ball", team, zone }, m * MIN);
const passes = (beats: Beat[]) => beats.filter((b) => b.k === "pass");

describe("live viewer script", () => {
  it("open play: passes go to players of the side on the ball, never to the man who has it", () => {
    const log = [
      ko,
      ...Array.from({ length: 30 }, (_, m) => ball(m + 1, m % 4 < 2 ? 0 : 1, (m % 3) as 0 | 1 | 2)),
    ];
    const { beats } = planPlay(log, both, MIN);
    const ps = passes(beats);
    expect(ps.length).toBeGreaterThan(20);
    let last: string | null = null;
    for (const b of ps) {
      expect(b.to).not.toBe(last);
      expect(b.dur).toBeGreaterThan(0);
      last = b.to;
    }
    // Each minute's passes go to that minute's side.
    for (const t of log.slice(1)) {
      if (t.e.t !== "ball") continue;
      const side = t.e.team === 0 ? "h" : "a";
      const inMinute = ps.filter((b) => b.at >= t.at && b.at < t.at + MIN);
      for (const b of inMinute) expect(b.to.startsWith(side)).toBe(true);
    }
    for (let i = 1; i < beats.length; i++)
      expect((beats[i] as Beat).at).toBeGreaterThanOrEqual((beats[i - 1] as Beat).at);
  });

  it("a chance: the ball reaches that player by the time the commentary says so; then the shot", () => {
    const log = [
      ko,
      ball(5, 0, 1),
      T({ m: 5, o: 1, t: "chance", team: 0, kind: "through_ball", player: "h10" }, 5 * MIN + 400),
      T({ m: 5, o: 2, t: "shot", team: 0, player: "h10", xg: 0.3, result: "saved" }, 5 * MIN + 700),
      T({ m: 5, o: 3, t: "save", team: 1, keeper: "a0", player: "h10" }, 5 * MIN + 850),
    ];
    const { beats } = planPlay(log, both, MIN);
    const toH10 = passes(beats)
      .filter((b) => b.to === "h10")
      .at(-1)!;
    expect(toH10.at + toH10.dur).toBeLessThanOrEqual(5 * MIN + 400 + 1);
    const shot = beats.find((b) => b.k === "shot")!;
    expect(shot).toMatchObject({ at: 5 * MIN + 700, result: "keeper", side: 0 });
    expect(beats.find((b) => b.k === "hold")).toMatchObject({ player: "a0" });
  });

  it("a goal: the scorer celebrates, play waits, then everyone goes back for kickoff", () => {
    const g = 9 * MIN + 500;
    const log = [
      ko,
      ball(9, 0, 2),
      T({ m: 9, o: 1, t: "shot", team: 0, player: "h9", xg: 0.3, result: "goal" }, g - 200),
      T({ m: 9, o: 2, t: "goal", team: 0, player: "h9", score: [1, 0] }, g),
      ball(10, 1, 1),
      ball(11, 1, 1),
    ];
    const plan = planPlay(log, both, MIN);
    expect(latest(plan.beats, g + 100)).toMatchObject({ k: "celebrate", scorer: "h9" });
    expect(latest(plan.modes, g + 100)?.mode).toBe("celebrate");
    const back = g + celebrationMs(MIN);
    expect(latest(plan.beats, back)).toMatchObject({ k: "reset" });
    // Minutes inside the celebration don't move the ball.
    expect(plan.beats.some((b) => b.k === "pass" && b.at > g && b.at < back)).toBe(false);
  });

  it("a shoot-out: each taker walks up and strikes before the result shows; misses are saves", () => {
    const p = (k: number, team: 0 | 1, scored: boolean) =>
      T(
        {
          m: 120,
          o: k,
          t: "pen",
          team,
          taker: `${team ? "a" : "h"}${10 - k}`,
          keeper: team ? "h0" : "a0",
          scored,
          tally: [0, 0],
        },
        10_000 + (k + 1) * PEN_MS,
      );
    const log = [p(0, 0, true), p(1, 1, false), p(2, 0, true)];
    const plan = planPlay(log, both, MIN);
    const pens = plan.beats.filter((b) => b.k === "pen");
    expect(pens).toHaveLength(3);
    for (const [i, b] of pens.entries()) {
      const shownAt = (log[i] as Timed).at;
      expect(b.at).toBeLessThan(b.kick);
      expect(b.kick).toBeLessThan(shownAt);
      expect(b.result).toBe(i === 1 ? "saved" : "scored");
    }
    expect(latest(plan.modes, 10_000 + PEN_MS)?.mode).toBe("pens");
  });

  it("a corner: the box fills, the taker is at the flag, then the cross is in the air", () => {
    const c = 20 * MIN + 300;
    const log = [
      ko,
      ball(20, 1, 2),
      T({ m: 20, o: 1, t: "corner", team: 1, player: "a7" }, c),
      ball(21, 1, 2),
    ];
    const plan = planPlay(log, both, MIN);
    expect(latest(plan.modes, c + 10)).toMatchObject({ mode: "box", side: 1 });
    expect(latest(plan.beats, c + 10)).toMatchObject({ k: "corner", taker: "a7" });
    const cross = passes(plan.beats).find((b) => b.at > c)!;
    expect(cross.loft).toBe(true);
  });

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
    const plan = planPlay(log, now, MIN);
    for (const b of passes(plan.beats)) {
      if (b.at > MIN + 300) expect(b.to).not.toBe("h3");
      if (b.at < 5000) expect(b.to).not.toBe("hs");
    }
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
