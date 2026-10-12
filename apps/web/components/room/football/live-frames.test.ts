import { DEFAULT_TACTICS, type MatchEvent, type TeamSheet } from "@gamehub/engine/football";
import { describe, expect, it } from "vitest";
import { frameAt, GOAL_MS } from "./live-frames";
import type { Timed } from "./playback";

const sheet = (p: string): TeamSheet => ({
  formation: 4, // 4-4-2
  xi: Array.from({ length: 11 }, (_, i) => ({ id: `${p}${i}`, role: "stopper" as never })),
  bench: [`${p}s`],
  tactics: { ...DEFAULT_TACTICS },
});
const kick = [sheet("h"), sheet("a")] as const;
const T = (e: MatchEvent, at: number): Timed => ({ e, at });
const ko = T({ m: 0, o: 0, t: "kickoff" }, 0);
const ball = (m: number, team: 0 | 1, zone: 0 | 1 | 2, at: number) =>
  T({ m, o: -1, t: "ball", team, zone }, at);
const home = (f: ReturnType<typeof frameAt>) => f.dots.filter((d) => d.side === 0 && !d.gk);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("live viewer frames", () => {
  it("kickoff: 22 players in their own halves, the ball on the spot", () => {
    const f = frameAt([ko], 10, kick, kick);
    expect(f.dots).toHaveLength(22);
    for (const d of f.dots) expect(d.side === 0 ? d.x <= 50 : d.x >= 50).toBe(true);
    expect(f.ball).toEqual({ x: 50, y: 50 });
  });

  it("a side on the ball pushes up the further it gets; someone of theirs has it", () => {
    const deep = frameAt([ko, ball(1, 0, 0, 100)], 200, kick, kick);
    const high = frameAt([ko, ball(1, 0, 2, 100)], 200, kick, kick);
    expect(mean(home(high).map((d) => d.x))).toBeGreaterThan(mean(home(deep).map((d) => d.x)) + 15);
    expect(high.carrier).toMatch(/^h/);
  });

  it("a sub the screen hasn't reached yet isn't on the pitch yet", () => {
    const now = [
      { ...sheet("h"), xi: sheet("h").xi.map((x, i) => (i === 9 ? { ...x, id: "hs" } : x)) },
      sheet("a"),
    ] as const;
    const log = [
      ko,
      ball(1, 0, 1, 100),
      T({ m: 2, o: 900, t: "sub", team: 0, off: "h9", on: "hs" }, 5000),
    ];
    expect(frameAt(log, 200, kick, now).dots.map((d) => d.id)).toContain("h9");
    const after = frameAt(log, 5100, kick, now).dots.map((d) => d.id);
    expect(after).toContain("hs");
    expect(after).not.toContain("h9");
  });

  it("a red card rings the player, then he leaves", () => {
    const log = [
      ko,
      ball(1, 1, 1, 100),
      T({ m: 1, o: 1, t: "foul", team: 0, player: "h3", card: "red" }, 300),
    ];
    const now = frameAt(log, 400, kick, kick);
    expect(now.card).toEqual({ id: "h3", colour: "red" });
    expect(now.dots.some((d) => d.id === "h3")).toBe(true);
    const later = frameAt(log, 5000, kick, kick);
    expect(later.dots.some((d) => d.id === "h3")).toBe(false);
    expect(later.dots).toHaveLength(21);
  });

  it("a goal: the ball in the net and the banner, then back to kickoff", () => {
    const log = [
      ko,
      ball(9, 0, 2, 100),
      T({ m: 9, o: 1, t: "shot", team: 0, player: "h10", xg: 0.3, result: "goal" }, 200),
      T({ m: 9, o: 2, t: "goal", team: 0, player: "h10", score: [1, 0] }, 400),
    ];
    const f = frameAt(log, 500, kick, kick);
    expect(f.ball.x).toBeGreaterThan(100);
    expect(f.banner).toEqual({ player: "h10", m: 9, side: 0 });
    const reset = frameAt(log, 400 + GOAL_MS + 10, kick, kick);
    expect(reset.banner).toBeNull();
    expect(reset.ball).toEqual({ x: 50, y: 50 });
  });

  it("a saved shot ends with the ball at their keeper", () => {
    const log = [
      ko,
      ball(5, 1, 2, 100),
      T({ m: 5, o: 1, t: "shot", team: 1, player: "a9", xg: 0.1, result: "saved" }, 200),
    ];
    const f = frameAt(log, 700, kick, kick);
    const keeper = f.dots.find((d) => d.gk && d.side === 0)!;
    expect(Math.abs(f.ball.x - keeper.x)).toBeLessThan(3);
  });
});
