import { describe, expect, it } from "vitest";
import { clientRoomMsg, createRoomRequest } from "./room";

describe("room messages", () => {
  it("accepts well-formed client messages", () => {
    for (const m of [
      { t: "hello" },
      { t: "hello", lastV: 3 },
      { t: "act", id: "a1", v: 2, a: { type: "place", cell: 4 } },
      { t: "ready", ready: true },
      { t: "seat_bot", seat: 1, level: "hard" },
      { t: "seat_bot", seat: 1, level: null },
      { t: "start" },
      { t: "ping", c: 123 },
    ]) {
      expect(clientRoomMsg.safeParse(m).success, JSON.stringify(m)).toBe(true);
    }
  });

  it("rejects unknown types and bad fields", () => {
    for (const m of [
      { t: "nope" },
      { t: "act", id: "", v: 0, a: {} },
      { t: "act", id: "x".repeat(65), v: 0, a: {} },
      { t: "act", id: "a", v: -1, a: {} },
      { t: "seat_bot", seat: 9, level: "easy" },
      { t: "ready" },
      "hello",
      null,
    ]) {
      expect(clientRoomMsg.safeParse(m).success, JSON.stringify(m)).toBe(false);
    }
  });

  it("validates room creation", () => {
    const ok = {
      game: "tictactoe",
      rules: {},
      botLevel: null,
      host: { userId: "u1", name: "tunde_o", avatar: null },
    };
    expect(createRoomRequest.safeParse(ok).success).toBe(true);
    expect(createRoomRequest.safeParse({ ...ok, game: "chess" }).success).toBe(false);
  });
});
