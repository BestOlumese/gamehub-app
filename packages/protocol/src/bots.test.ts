import { describe, expect, it } from "vitest";
import { botMoveRequest } from "./bots";

describe("bot move request", () => {
  const ok = {
    game: "chess",
    level: "hard",
    position: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    history: ["g8f6", "g1f3"],
    movetimeMs: 200,
    roomId: "ABC234",
  };
  it("accepts a well-formed request; history defaults to none", () => {
    expect(botMoveRequest.safeParse(ok).success).toBe(true);
    const { history: _h, ...noHistory } = ok;
    expect(botMoveRequest.parse(noHistory).history).toEqual([]);
  });
  it("refuses other games, levels, long thinks and odd moves", () => {
    for (const bad of [
      { ...ok, game: "whot" },
      { ...ok, level: "easy" },
      { ...ok, movetimeMs: 5000 },
      { ...ok, history: ["e2e4; rm -rf"] },
      { ...ok, position: "x".repeat(300) },
    ])
      expect(botMoveRequest.safeParse(bad).success).toBe(false);
  });
});
