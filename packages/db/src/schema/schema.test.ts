import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { emailLog, gameSlug } from "./index";

describe("schema", () => {
  it("game_slug enum matches the launch games", () => {
    expect(gameSlug.enumValues).toEqual(["whot", "ludo", "snakes", "tictactoe", "rps"]);
  });

  it("email_log is indexed by created_at for the quota window", () => {
    const cfg = getTableConfig(emailLog);
    expect(cfg.name).toBe("email_log");
    expect(cfg.indexes.map((i) => i.config.name)).toContain("email_log_created_idx");
  });
});
