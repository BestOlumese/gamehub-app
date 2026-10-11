import { describe, expect, it } from "vitest";
import { gameSlugSchema } from "./game-slug";

describe("gameSlugSchema", () => {
  it("accepts every launch game", () => {
    for (const slug of [
      "whot",
      "ludo",
      "snakes",
      "tictactoe",
      "rps",
      "chess",
      "draughts",
      "plots",
      "football",
    ]) {
      expect(gameSlugSchema.safeParse(slug).success).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(gameSlugSchema.safeParse("monopoly").success).toBe(false);
    expect(gameSlugSchema.safeParse(1).success).toBe(false);
  });
});
