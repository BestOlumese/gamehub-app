import { describe, expect, it } from "vitest";
import {
  ludo,
  ludoNaija,
  seededRng,
  snakes,
  snakesNaija,
  tictactoe,
  tttNaija,
  whot,
  whotNaija,
} from ".";

// The room's "Who goes first" setting reaches each game through setup's `first`.
describe("first player", () => {
  const ctx = <R>(rules: R) => ({ rng: seededRng("first"), rules, now: 0 });

  it("starts on the given seat, or seat 0 when none is given", () => {
    expect(whot.setup(4, ctx({ ...whotNaija, firstCardEffect: "none" }), 2).turn).toBe(2);
    expect(ludo.setup(4, ctx(ludoNaija), 3).turn).toBe(3);
    expect(snakes.setup(6, ctx(snakesNaija), 5).turn).toBe(5);
    const ttt = tictactoe.setup(2, ctx(tttNaija), 1);
    expect([ttt.turn, ttt.starter]).toEqual([1, 1]);
    expect(snakes.setup(6, ctx(snakesNaija)).turn).toBe(0);
  });

  it("a Whot 8 as the first call card skips the player after the first", () => {
    // Find a seed whose first call card is an 8, then check the skip is relative to `first`.
    for (let i = 0; i < 500; i++) {
      const c = {
        rng: seededRng(`eight-${i}`),
        rules: { ...whotNaija, firstCardEffect: "apply" as const },
        now: 0,
      };
      const s = whot.setup(4, c, 2);
      if (/^[a-z]+-8$/.test(s.pile[0] ?? "")) {
        expect(s.turn).toBe(3);
        return;
      }
    }
    throw new Error("no seed dealt an 8 first");
  });
});
