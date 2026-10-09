import type { DraughtsMove } from "@gamehub/engine/draughts";
import { describe, expect, it } from "vitest";
import { choose, finalsFrom, hop, parseTyped } from "./pick";

const m = (from: number, path: number[], captured: number[] = []): DraughtsMove => ({
  from,
  path,
  captured,
});

describe("picking a draughts move", () => {
  it("one tap on the final square plays a multi-capture", () => {
    const moves = [m(32, [23, 14], [28, 19]), m(32, [27])];
    expect(finalsFrom(moves, 32)).toEqual([14, 27]);
    expect(choose(moves, 32, 14)).toEqual({ move: moves[0] });
    expect(choose(moves, 32, 40)).toBeNull();
  });

  it("two routes taking the same seeds to the same square: no need to choose", () => {
    const moves = [m(46, [28, 10], [37, 19]), m(46, [23, 10], [37, 19])];
    expect(choose(moves, 46, 10)).toEqual({ move: moves[0] });
  });

  it("two different captures ending on one square: tap the hops in turn", () => {
    const a = m(46, [28, 10], [37, 19]);
    const b = m(46, [24, 10], [41, 15]);
    const moves = [a, b];
    expect(choose(moves, 46, 10)).toEqual({ next: [28, 24] });
    expect(hop(moves, 46, 10, [], 24)).toEqual({ move: b });
    expect(hop(moves, 46, 10, [], 33)).toBeNull();
  });

  it("a route that ends where a longer one passes: tap the square again to stop there", () => {
    const short = m(28, [19], [23]);
    const long = m(28, [19, 8, 19], [23, 13, 14]);
    const moves = [short, long];
    expect(choose(moves, 28, 19)).toEqual({ next: [19] });
    const step = hop(moves, 28, 19, [], 19);
    expect(step).toEqual({ hops: [19], next: [19, 8] });
    expect(hop(moves, 28, 19, [19], 19)).toEqual({ move: short });
    expect(hop(moves, 28, 19, [19], 8)).toEqual({ move: long });
  });
});

describe("typing a draughts move", () => {
  const moves = [
    m(32, [23, 14], [28, 19]),
    m(32, [27]),
    m(46, [28, 10], [37, 19]),
    m(46, [24, 10], [41, 15]),
  ];
  it("reads full and short forms", () => {
    expect(parseTyped(moves, "32-27")).toEqual({ move: moves[1] });
    expect(parseTyped(moves, "32x23x14")).toEqual({ move: moves[0] });
    expect(parseTyped(moves, " 32x14 ")).toEqual({ move: moves[0] });
    expect(parseTyped(moves, "46x24x10")).toEqual({ move: moves[3] });
  });
  it("says what's wrong", () => {
    expect(parseTyped(moves, "46x10")).toMatchObject({
      error: expect.stringContaining("every square"),
    });
    expect(parseTyped(moves, "e4")).toMatchObject({ error: expect.stringContaining("32-28") });
    expect(parseTyped(moves, "31-26")).toMatchObject({
      error: expect.stringContaining("isn't a legal"),
    });
  });
});
