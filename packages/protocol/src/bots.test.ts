import { describe, expect, it } from "vitest";
import { botMoveRequest, draughtsBotRequest } from "./bots";

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

describe("draughts bot request", () => {
  const ok = {
    game: "draughts",
    level: "hard",
    variant: "naija10",
    board: "d".repeat(20) + ".".repeat(10) + "l".repeat(20),
    turn: "light",
    menCaptureBackward: true,
    flyingKings: true,
    captureRule: "free",
    movetimeMs: 150,
    roomId: "ABC234",
  };
  it("accepts a well-formed request", () => {
    expect(draughtsBotRequest.safeParse(ok).success).toBe(true);
    expect(
      draughtsBotRequest.safeParse({ ...ok, variant: "english8", board: ".".repeat(32) }).success,
    ).toBe(true);
  });
  it("refuses boards of the wrong size or with odd characters, and other levels", () => {
    for (const bad of [
      { ...ok, board: ".".repeat(32) },
      { ...ok, board: "x".repeat(50) },
      { ...ok, level: "medium" },
      { ...ok, movetimeMs: 1000 },
    ])
      expect(draughtsBotRequest.safeParse(bad).success).toBe(false);
  });
});
