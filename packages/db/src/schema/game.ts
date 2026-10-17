import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { gameSlug } from "./enums";

// Results (docs/07-database.md). Tournaments write the first ones (Phase 12); quick-match adds
// ratings and leaderboards (Phase 13).

export const tournament = pgTable(
  "tournament",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    hostId: text("host_id").references(() => user.id, { onDelete: "set null" }),
    entrants: smallint("entrants").notNull(),
    botFill: text("bot_fill"),
    /** Football data version, if a stage used it. */
    dataVersion: text("data_version"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("tournament_code_start_uq").on(t.code, t.startedAt)],
);

export const tournamentStage = pgTable(
  "tournament_stage",
  {
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournament.id, { onDelete: "cascade" }),
    idx: smallint("idx").notNull(),
    game: gameSlug("game").notNull(),
    rules: jsonb("rules").notNull(),
    tableSize: smallint("table_size").notNull(),
    /** Tables: how many go through per table; knockouts: players left after the stage. */
    advancePerTable: smallint("advance_per_table").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.idx] })],
);

export const tournamentEntry = pgTable(
  "tournament_entry",
  {
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournament.id, { onDelete: "cascade" }),
    entrant: smallint("entrant").notNull(),
    /** Null: a bot, or a deleted account. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    isBot: boolean("is_bot").notNull(),
    displayName: text("display_name").notNull(),
    /** Shared places allowed ("=5th"). */
    place: smallint("place").notNull(),
    /** Null: reached the last stage. */
    outAtStage: smallint("out_at_stage"),
    playedByBot: boolean("played_by_bot").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.entrant] }), index("te_user_idx").on(t.userId)],
);

export const match = pgTable(
  "match",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    game: gameSlug("game").notNull(),
    kind: text("kind", { enum: ["private", "quick", "tournament"] }).notNull(),
    ranked: boolean("ranked").notNull(),
    playerCount: smallint("player_count").notNull(),
    rules: jsonb("rules").notNull(),
    variant: text("variant").notNull().default("standard"),
    timeControl: text("time_control"),
    tournamentId: text("tournament_id").references(() => tournament.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("match_room_start_uq").on(t.roomId, t.startedAt),
    index("match_ended_idx").on(t.endedAt),
  ],
);

export const matchPlayer = pgTable(
  "match_player",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => match.id, { onDelete: "cascade" }),
    seat: smallint("seat").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    isBot: boolean("is_bot").notNull(),
    botLevel: text("bot_level"),
    displayName: text("display_name").notNull(),
    place: smallint("place").notNull(),
    leftEarly: boolean("left_early").notNull().default(false),
    /** Ranked games only (Phase 13). */
    ratingBefore: real("rating_before"),
    ratingAfter: real("rating_after"),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.seat] }),
    index("mp_user_idx").on(t.userId, t.matchId),
  ],
);
