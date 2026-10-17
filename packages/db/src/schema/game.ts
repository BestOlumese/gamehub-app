import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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

/** openskill rating per user, game and variant (chess: bullet/blitz/rapid; draughts: naija10/english8). */
export const rating = pgTable(
  "rating",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    game: gameSlug("game").notNull(),
    variant: text("variant").notNull().default("standard"),
    mu: real("mu").notNull().default(25),
    sigma: real("sigma")
      .notNull()
      .default(sql`25.0 / 3`),
    /** mu − 3σ: the conservative number boards sort by. */
    ordinal: real("ordinal").notNull().default(0),
    /** The friendly number shown (1000 + 40 × ordinal). */
    display: integer("display").notNull().default(1000),
    played: integer("played").notNull().default(0),
    won: integer("won").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.game, t.variant] }),
    index("rating_board_idx").on(t.game, t.variant, t.ordinal),
  ],
);

/** Football Draft solo runs: the profile shows the best (docs/07-database.md). */
export const footballSoloRun = pgTable(
  "football_solo_run",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    wins: smallint("wins").notNull(),
    played: smallint("played").notNull(),
    teamRating: smallint("team_rating").notNull(),
    luck: text("luck").notNull(),
    dataVersion: text("data_version").notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("fsr_user_idx").on(t.userId, t.wins)],
);

/** Every game counted (ranked or not), per user, game and variant. */
export const userStats = pgTable(
  "user_stats",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    game: gameSlug("game").notNull(),
    variant: text("variant").notNull().default("standard"),
    played: integer("played").notNull().default(0),
    won: integer("won").notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.game, t.variant] })],
);
