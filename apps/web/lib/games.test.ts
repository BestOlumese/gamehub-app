import { GAME_SLUGS } from "@gamehub/engine";
import { describe, expect, it } from "vitest";
import { games } from "./games";

describe("games list", () => {
  it("lists every launch game once, in engine order", () => {
    expect(games.map((g) => g.slug)).toEqual([...GAME_SLUGS]);
  });
});
