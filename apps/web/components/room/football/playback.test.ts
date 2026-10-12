import type { MatchEvent, MatchStats } from "@gamehub/engine/football";
import { describe, expect, it } from "vitest";
import { clockOf, schedule, scoreOf, shown, statsOf } from "./playback";

const ball = (m: number, team: 0 | 1 = 0): MatchEvent => ({ m, o: -1, t: "ball", team, zone: 1 });
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

describe("football playback", () => {
  const log: MatchEvent[] = [
    { m: 0, o: 0, t: "kickoff" },
    ball(1),
    { m: 1, o: 0, t: "shot", team: 0, player: "a", xg: 0.3, result: "goal" },
    { m: 1, o: 1, t: "goal", team: 0, player: "a", score: [1, 0] },
    ball(2, 1),
    ball(3, 1),
    { m: 3, o: 0, t: "foul", team: 0, player: "b", card: "yellow" },
  ];
  const timed = schedule(log, 1000, 1000);

  it("events show on the match clock: one minute per ball event, spread inside it", () => {
    const at = (t: string) => timed.find((x) => x.e.t === t)?.at;
    expect(at("kickoff")).toBe(1000);
    expect(at("shot")).toBeGreaterThan(1000);
    expect(at("goal")).toBeLessThan(2000);
    expect(timed.filter((x) => x.e.t === "ball").map((x) => x.at)).toEqual([1000, 2000, 3000]);
  });

  it("no spoilers: the score and ticker count only what's shown", () => {
    expect(scoreOf(shown(timed, 1100)).score).toEqual([0, 0]);
    expect(scoreOf(shown(timed, 1900)).score).toEqual([1, 0]);
    const st = statsOf(zero(), shown(timed, 9999), 1);
    expect([st.shots[0], st.onTarget[0], st.yellows[0], st.fouls[0]]).toEqual([1, 1, 1, 1]);
    expect(st.possession).toEqual([33, 67]);
  });

  it("the clock reads the last minute shown, with stoppage time", () => {
    expect(clockOf(shown(timed, 2500), 1)).toBe("2'");
    const late: MatchEvent[] = [
      { m: 0, o: 0, t: "kickoff" },
      ball(45),
      ball(45),
      ball(45),
      { m: 45, o: 999, t: "half_time" },
    ];
    const t2 = schedule(late, 0, 1000);
    expect(clockOf(shown(t2, 2100), 1)).toBe("45+2'");
    expect(clockOf(shown(t2, 99999), 1)).toBe("HT");
  });

  it("earlier halves are already shown; a shoot-out shows kick by kick", () => {
    const pens: MatchEvent[] = [
      { m: 0, o: 0, t: "kickoff" },
      { m: 120, o: 999, t: "et_end" },
      { m: 120, o: 0, t: "pen", team: 0, taker: "a", keeper: "k", scored: true, tally: [1, 0] },
      { m: 120, o: 1, t: "pen", team: 1, taker: "b", keeper: "j", scored: false, tally: [1, 0] },
    ];
    const t = schedule(pens, 10_000, 1000);
    expect(t.filter((x) => x.at === 0)).toHaveLength(2);
    expect(scoreOf(shown(t, 10_000)).pens).toBeNull();
    expect(scoreOf(shown(t, 99_999)).pens).toEqual([1, 0]);
  });
});
