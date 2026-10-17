import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { emailLog, gameSlug, match, matchPlayer, tournamentEntry } from "./index";

describe("schema", () => {
  it("game_slug enum has every game (values are only ever added, in order)", () => {
    expect(gameSlug.enumValues).toEqual([
      "whot",
      "ludo",
      "snakes",
      "tictactoe",
      "rps",
      "chess",
      "draughts",
      "plots",
      "football",
    ]);
  });

  it("results: one match per room game, players by seat, tournament entries by user", () => {
    expect(getTableConfig(match).indexes.map((i) => i.config.name)).toContain(
      "match_room_start_uq",
    );
    expect(getTableConfig(matchPlayer).indexes.map((i) => i.config.name)).toContain("mp_user_idx");
    expect(getTableConfig(tournamentEntry).indexes.map((i) => i.config.name)).toContain(
      "te_user_idx",
    );
  });

  it("email_log is indexed by created_at for the quota window", () => {
    const cfg = getTableConfig(emailLog);
    expect(cfg.name).toBe("email_log");
    expect(cfg.indexes.map((i) => i.config.name)).toContain("email_log_created_idx");
  });
});
