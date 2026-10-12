import { GAME_SLUGS } from "@gamehub/engine";
import { describe, expect, it } from "vitest";
import { PLAYER_RANGE } from "./game-meta";
import { games } from "./games";
import { gameFor } from "./playable-games";

describe("games list", () => {
  it("lists every launch game once, in engine order", () => {
    expect(games.map((g) => g.slug)).toEqual([...GAME_SLUGS]);
  });

  it("the setup sheet's player counts match each engine", () => {
    for (const slug of GAME_SLUGS) {
      const def = gameFor(slug);
      if (def) expect(PLAYER_RANGE[slug], slug).toEqual([def.minPlayers, def.maxPlayers]);
    }
  });
});
