import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { seededRng } from "./rng";

describe("seededRng", () => {
  it("same seed, same stream", () => {
    const a = seededRng("abc"),
      b = seededRng("abc");
    expect(Array.from({ length: 20 }, () => a.int(6))).toEqual(
      Array.from({ length: 20 }, () => b.int(6)),
    );
  });

  test.prop([fc.string(), fc.array(fc.integer({ min: 1, max: 1000 }), { maxLength: 50 })])(
    "resuming at the saved counter continues the same stream",
    (seed, bounds) => {
      const full = seededRng(seed);
      const before = bounds.map((n) => full.int(n));
      const resumed = seededRng(seed, full.counter());
      const reference = seededRng(seed);
      bounds.forEach((n) => reference.int(n));
      expect(resumed.int(1_000_000)).toBe(reference.int(1_000_000));
      expect(before.every((x, i) => x >= 0 && x < bounds[i]!)).toBe(true);
    },
  );

  test.prop([fc.string(), fc.array(fc.integer(), { maxLength: 30 })])(
    "shuffle is a permutation",
    (seed, arr) => {
      const out = seededRng(seed).shuffle(arr);
      expect([...out].sort()).toEqual([...arr].sort());
    },
  );

  it("dice are roughly uniform", () => {
    const rng = seededRng("dice");
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[rng.int(6)]!++;
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });
});
