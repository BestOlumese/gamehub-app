import { describe, expect, it } from "vitest";
import { parseTypedMove } from "./move-input";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("typed moves", () => {
  it("reads SAN and UCI, leniently", () => {
    expect(parseTypedMove(START, "e4")).toEqual({ from: "e2", to: "e4" });
    expect(parseTypedMove(START, " Nf3 ")).toEqual({ from: "g1", to: "f3" });
    expect(parseTypedMove(START, "g1f3")).toEqual({ from: "g1", to: "f3" });
    expect(parseTypedMove(START, "E2E4")).toEqual({ from: "e2", to: "e4" });
  });
  it("castles with letters or zeros, and promotes", () => {
    const castle = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
    expect(parseTypedMove(castle, "O-O")).toEqual({ from: "e1", to: "g1" });
    expect(parseTypedMove(castle, "0-0-0")).toEqual({ from: "e1", to: "c1" });
    expect(parseTypedMove("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1", "e8=Q")).toEqual({
      from: "e7",
      to: "e8",
      promotion: "q",
    });
  });
  it("refuses illegal or nonsense moves", () => {
    expect(parseTypedMove(START, "e5")).toBeNull();
    expect(parseTypedMove(START, "Ke2")).toBeNull();
    expect(parseTypedMove(START, "hello")).toBeNull();
    expect(parseTypedMove(START, "")).toBeNull();
  });
});
