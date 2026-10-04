import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET } from "./constants";
import { roomCodeSchema } from "./room-code";

describe("roomCodeSchema", () => {
  it("accepts codes and normalises case", () => {
    expect(roomCodeSchema.parse("abc234")).toBe("ABC234");
  });
  it("rejects look-alike characters and wrong lengths", () => {
    for (const bad of ["ABC10O", "ABCI23", "ABC23", "ABC2345"]) {
      expect(roomCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("uses 32 symbols", () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(32);
  });
});
