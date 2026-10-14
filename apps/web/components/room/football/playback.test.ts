import type { MatchEvent, MatchStats } from "@gamehub/engine/football";
import { describe, expect, it } from "vitest";
import { clockOf, matchNow, schedule, scoreOf, shown, statsOf } from "./playback";

const ball = (m: number, team: 0 | 1 = 0): MatchEvent => ({
  m,
  o: -1,
  t: "ball",
  team,
  zone: 1,
  path: [
    [`${team ? "a" : "h"}4`, "p"],
    [`${team ? "a" : "h"}7`, "p"],
  ],
});
const zero = (): MatchStats => ({
  possession: [50, 50],
  shots: [0, 0],
  onTarget: [0, 0],
  xg: [0, 0],
  corners: [0, 0],
  fouls: [0, 0],
  yellows: [0, 0],
  reds: [0, 0],
});
const timing = { halfMs: 45_000, highlights: true };

describe("football playback", () => {
  const log: MatchEvent[] = [
    { m: 0, o: 0, t: "kickoff" },
    ball(1),
    { m: 1, o: 0, t: "chance", team: 0, kind: "build_up", player: "h7" },
    { m: 1, o: 1, t: "shot", team: 0, player: "h7", xg: 0.3, result: "goal" },
    { m: 1, o: 2, t: "goal", team: 0, player: "h7", score: [1, 0] },
    ball(2, 1),
    ball(3, 1),
    { m: 3, o: 0, t: "foul", team: 0, player: "b", card: "yellow" },
  ];
  const { timed } = schedule(log, 1000, timing);

  it("events show in order on the shared timeline: kickoff first, the chance before the shot before the goal", () => {
    const at = (t: string) => timed.find((x) => x.e.t === t)?.at as number;
    expect(at("kickoff")).toBe(1000);
    for (let k = 1; k < timed.length; k++)
      expect((timed[k] as { at: number }).at).toBeGreaterThanOrEqual(
        (timed[k - 1] as { at: number }).at,
      );
    expect(at("chance")).toBeLessThan(at("shot"));
    expect(at("shot")).toBeLessThan(at("goal"));
  });

  it("no spoilers: the score and ticker count only what's shown", () => {
    const goalAt = timed.find((x) => x.e.t === "goal")?.at as number;
    expect(scoreOf(shown(timed, goalAt - 1)).score).toEqual([0, 0]);
    expect(scoreOf(shown(timed, goalAt)).score).toEqual([1, 0]);
    const st = statsOf(zero(), shown(timed, Number.MAX_SAFE_INTEGER), 1);
    expect([st.shots[0], st.onTarget[0], st.yellows[0], st.fouls[0]]).toEqual([1, 1, 1, 1]);
    expect(st.possession).toEqual([33, 67]);
  });

  it("the clock reads the last minute shown, with stoppage time", () => {
    const late: MatchEvent[] = [
      { m: 0, o: 0, t: "kickoff" },
      ball(45),
      ball(45),
      ball(45),
      { m: 45, o: 999, t: "half_time" },
    ];
    const t2 = schedule(late, 0, timing).timed;
    const third = t2.filter((x) => x.e.t === "ball")[2]?.at as number;
    expect(clockOf(shown(t2, third), 1)).toBe("45+2'");
    expect(clockOf(shown(t2, Number.MAX_SAFE_INTEGER), 1)).toBe("HT");
  });

  it("a timeout freezes the match clock, then it carries on from where it stopped", () => {
    const pause = { at: 10_000, until: 30_000 };
    expect(matchNow(9_000, pause)).toBe(9_000);
    expect(matchNow(20_000, pause)).toBe(10_000);
    expect(matchNow(35_000, pause)).toBe(15_000);
    expect(matchNow(35_000, null)).toBe(35_000);
  });

  it("earlier halves are already shown; a shoot-out shows kick by kick", () => {
    const pens: MatchEvent[] = [
      { m: 0, o: 0, t: "kickoff" },
      { m: 120, o: 999, t: "et_end" },
      { m: 120, o: 0, t: "pen", team: 0, taker: "a", keeper: "k", scored: true, tally: [1, 0] },
      { m: 120, o: 1, t: "pen", team: 1, taker: "b", keeper: "j", scored: false, tally: [1, 0] },
    ];
    const t = schedule(pens, 10_000, timing).timed;
    expect(t.filter((x) => x.at === 0)).toHaveLength(2);
    expect(scoreOf(shown(t, 10_000)).pens).toBeNull();
    expect(scoreOf(shown(t, 99_999)).pens).toEqual([1, 0]);
  });
});
