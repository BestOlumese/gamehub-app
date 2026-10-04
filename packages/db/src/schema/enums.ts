import { pgEnum } from "drizzle-orm/pg-core";

export const gameSlug = pgEnum("game_slug", ["whot", "ludo", "snakes", "tictactoe", "rps"]);
