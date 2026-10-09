import { chessNaija } from "@gamehub/engine/chess";
import { describe, expect, it } from "vitest";
import { timeControlText } from "./time-control";

describe("time control label", () => {
  it("says when time is added per move", () => {
    expect(timeControlText(chessNaija)).toBe("5 min + 3 s a move · Blitz");
    expect(
      timeControlText({ ...chessNaija, timeControl: { baseSeconds: 600, incrementSeconds: 0 } }),
    ).toBe("10 min each · Rapid");
    expect(
      timeControlText({ ...chessNaija, timeControl: { baseSeconds: 60, incrementSeconds: 0 } }),
    ).toBe("1 min each · Bullet");
    expect(timeControlText({ ...chessNaija, timeControl: null })).toBe("No clock · 5 min a move");
  });
});
