import {
  DEFAULT_TACTICS,
  type Card,
  type MatchupPart,
  type TeamSheet,
} from "@gamehub/engine/football";
import { describe, expect, it } from "vitest";
import { meterOf, tipFor } from "./assistant";

const sheet: TeamSheet = {
  formation: 4, // 4-4-2: GK RB CB CB LB RM CM CM LM ST ST
  xi: Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, role: "stopper" as never })),
  bench: ["b0", "b1"],
  tactics: { ...DEFAULT_TACTICS, build: "short" },
};
const card = (short: string, pos: string, ovr: number) =>
  ({ short, positions: [pos], ovr }) as unknown as Card;
const cards: Record<string, Card> = {
  p6: card("Ndidi", "CM", 80),
  b0: card("Onyeka", "CM", 76),
  b1: card("Osimhen", "ST", 88),
};
const P = (key: MatchupPart["key"], v: number): MatchupPart => ({ key, v });
const base = {
  mySide: 0 as const,
  sheet,
  fit: null,
  cards,
  subsLeft: 3,
  score: [0, 0] as const,
  minute: 30,
};

describe("matchup meter", () => {
  it("their press beating our short passing: their edge, and says why", () => {
    const m = meterOf([[P("short_vs_press", -0.9)], [P("short_open", 0.15)]], 0);
    expect(m.value).toBeLessThan(-0.5);
    expect(m.label).toBe("Big edge to them");
    expect(m.why).toBe("Their press is winning the ball off our short passing");
  });
  it("reads the same matchup from the other side", () => {
    const m = meterOf([[P("short_vs_press", -0.9)], [P("short_open", 0.15)]], 1);
    expect(m.value).toBeGreaterThan(0.5);
    expect(m.why).toBe("Our press is winning the ball high up");
  });
  it("level tactics: even, no reason", () => {
    expect(meterOf([[], []], 0)).toEqual({ value: 0, label: "Even", why: null });
  });
});

describe("assistant tips", () => {
  it("names the counter to a press and gives the change that does it", () => {
    const tip = tipFor({ ...base, matchup: [[P("short_vs_press", -0.9)], []] });
    expect(tip?.text).toMatch(/Go long/);
    expect(tip?.action).toEqual({ type: "tactics", tactics: { ...sheet.tactics, build: "long" } });
  });
  it("a spent player: the best sub for his position", () => {
    const tip = tipFor({ ...base, matchup: [[], []], fit: { p6: 38, p1: 70 } });
    expect(tip?.text).toBe("Ndidi is spent. Bring on Onyeka.");
    expect(tip?.action).toEqual({ type: "swap", a: { slot: 6 }, b: { bench: 0 } });
    expect(tipFor({ ...base, matchup: [[], []], fit: { p6: 38 }, subsLeft: 0 })).toBeNull();
  });
  it("late on, from the score as shown: chase or protect", () => {
    expect(tipFor({ ...base, matchup: [[], []], score: [0, 1], minute: 75 })?.action).toEqual({
      type: "shout",
      shout: "attack",
    });
    expect(tipFor({ ...base, matchup: [[], []], score: [2, 1], minute: 84 })?.action).toEqual({
      type: "shout",
      shout: "hold",
    });
    expect(tipFor({ ...base, matchup: [[], []], score: [0, 1], minute: 40 })).toBeNull();
  });
});
