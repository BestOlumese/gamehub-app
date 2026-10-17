import { pgEnum } from "drizzle-orm/pg-core";

// Values can be added but never removed (Postgres enums): add a game only when it ships.
export const gameSlug = pgEnum("game_slug", [
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
