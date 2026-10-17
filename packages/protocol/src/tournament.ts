// Tournament lobby socket, creation and results (docs/16-tournaments.md → Protocol).
import type { GameSlug } from "@gamehub/engine";
import type { BracketTable, Placement } from "@gamehub/engine/tournament";
import { z } from "zod";
import { ROOM_CODE_ALPHABET, TOURNAMENT_CODE_LENGTH } from "./constants";
import { gameSlugSchema } from "./game-slug";
import { botLevelSchema, type BotLevel, type RoomErrorCode } from "./room";

export const tournamentCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${TOURNAMENT_CODE_LENGTH}}$`)));

export const stageSpecSchema = z.object({
  game: gameSlugSchema,
  rules: z.unknown(),
  tableSize: z.number().int().min(2).max(8),
  advance: z.number().int().min(1).max(16),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
});
export type StageSpecMsg = z.infer<typeof stageSpecSchema>;

export const tournamentConfigSchema = z.object({
  name: z.string().trim().min(3).max(40),
  entrants: z.number().int().min(4).max(32),
  /** Bots take the empty places at the start (and can go through), or null to wait for people. */
  botFill: botLevelSchema.nullable(),
  stages: z.array(stageSpecSchema).min(1).max(6),
  /** Start by itself once every place is taken. */
  autoStart: z.boolean(),
  /** People outside the tournament may watch tables (knocked-out players always can). */
  spectators: z.boolean(),
});
export type TournamentConfig = z.infer<typeof tournamentConfigSchema>;

const host = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().nullable(),
});

/** web → Worker, HMAC-signed: a new tournament with its host as the first entrant. */
export const createTournamentRequest = z.object({ config: tournamentConfigSchema, host });
export type CreateTournamentRequest = z.infer<typeof createTournamentRequest>;
export type CreateTournamentResponse = { code: string };

// ── Client → server ──────────────────────────────────────────────────────────

export const clientTournamentMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("t_hello") }),
  z.object({ t: z.literal("t_join") }),
  z.object({ t: z.literal("t_leave") }),
  z.object({ t: z.literal("t_config"), config: tournamentConfigSchema }),
  z.object({ t: z.literal("t_kick"), entrant: z.string().min(1).max(8) }),
  z.object({ t: z.literal("t_start") }),
  z.object({ t: z.literal("t_cancel") }),
  z.object({ t: z.literal("ping"), c: z.number() }),
]);
export type ClientTournamentMsg = z.infer<typeof clientTournamentMsg>;

// ── Server → client ──────────────────────────────────────────────────────────

export type TournamentPhase = "lobby" | "running" | "finished" | "cancelled";

export type EntrantPublic = {
  id: string;
  userId: string | null;
  name: string;
  avatar: string | null;
  bot: BotLevel | null;
  status: "in" | "out" | "left";
  byes: number;
  host: boolean;
  /** Online on the tournament page or at their table (people only). */
  online: boolean;
};

export type TablePublic = BracketTable & {
  /** The table's room code (to go to it or watch it), once it exists. */
  code: string | null;
};

export type TournamentPublic = {
  code: string;
  phase: TournamentPhase;
  config: TournamentConfig;
  entrants: EntrantPublic[];
  /** The stage and knockout round being played (0-based). */
  stage: number;
  round: number;
  tables: TablePublic[];
  placements: Placement[] | null;
  startedAt: number | null;
  endedAt: number | null;
};

export type TournamentErrorCode =
  RoomErrorCode | "TOURNAMENT_FULL" | "BAD_STAGES" | "NOT_IN_TOURNAMENT" | "TABLE_NOT_READY";

export type TournamentEventMsg =
  | { e: "stage_started"; stage: number; round: number }
  | { e: "table_done"; table: string }
  | { e: "advanced"; entrant: string; stage: number }
  | { e: "eliminated"; entrant: string; stage: number }
  | { e: "champion"; entrant: string };

export type ServerTournamentMsg =
  | {
      t: "t_snapshot";
      v: number;
      state: TournamentPublic;
      /** Your entrant id, or "spectator". */
      you: string | "spectator";
      serverNow: number;
    }
  | ({ t: "t_event" } & TournamentEventMsg)
  /** Your next table is ready: go to /r/<code>. */
  | { t: "t_go"; table: string; code: string }
  /** BAD_STAGES carries the plan's problems in plain words. */
  | { t: "error"; code: TournamentErrorCode; detail?: string[] }
  | { t: "pong"; c: number; s: number };

// ── Results (Worker → web, HMAC-signed) ──────────────────────────────────────

const resultPlayer = z.object({
  seat: z.number().int().min(0).max(7),
  userId: z.string().nullable(),
  isBot: z.boolean(),
  botLevel: botLevelSchema.nullable(),
  displayName: z.string().min(1).max(40),
  place: z.number().int().min(1).max(8),
  leftEarly: z.boolean(),
});

/** One finished table: a `match` row (kind "tournament", unranked) and its players. */
export const tournamentMatchSchema = z.object({
  id: z.string().min(1).max(40),
  roomId: z.string().min(1).max(16),
  game: gameSlugSchema,
  rules: z.unknown(),
  playerCount: z.number().int().min(2).max(8),
  startedAt: z.number().int(),
  endedAt: z.number().int(),
  players: z.array(resultPlayer).min(2).max(8),
});
export type TournamentMatch = z.infer<typeof tournamentMatchSchema>;

export const tournamentResultSchema = z.object({
  id: z.string().min(1).max(40),
  code: tournamentCodeSchema,
  name: z.string().min(1).max(40),
  hostUserId: z.string().nullable(),
  botFill: botLevelSchema.nullable(),
  dataVersion: z.string().nullable(),
  startedAt: z.number().int(),
  endedAt: z.number().int(),
  stages: z
    .array(
      z.object({
        game: gameSlugSchema,
        rules: z.unknown(),
        tableSize: z.number().int(),
        advance: z.number().int(),
      }),
    )
    .min(1)
    .max(6),
  entries: z
    .array(
      z.object({
        entrant: z.number().int().min(0).max(31),
        userId: z.string().nullable(),
        isBot: z.boolean(),
        displayName: z.string().min(1).max(40),
        place: z.number().int().min(1).max(32),
        outAtStage: z.number().int().min(0).max(5).nullable(),
        playedByBot: z.boolean(),
      }),
    )
    .min(4)
    .max(32),
  matches: z.array(tournamentMatchSchema).max(64),
});
export type TournamentResult = z.infer<typeof tournamentResultSchema>;

/** A table room tells its tournament how it went (Durable Object RPC, same Worker). */
export type TableReport = {
  table: string;
  /** Entrant ids by place; ties grouped (a match still level after its decider). */
  ranking: string[][];
  /** Entrants a bot played for at this table. */
  playedByBot: string[];
  /** The table's games as match records (a best-of series is several). */
  matches: TournamentMatch[];
  /** Football: each manager's drafted squad, kept for later football stages. */
  squads?: Record<string, unknown>;
};

/** What a tournament tells a new table room (Durable Object RPC). */
export type TableInit = {
  code: string;
  game: GameSlug;
  rules: unknown;
  /** Entrant per seat: a person (by user id) or a bot. */
  seats: Array<{
    entrant: string;
    userId: string | null;
    name: string;
    avatar: string | null;
    /** A bot entrant, or a person who left the tournament (a bot plays for them). */
    bot: BotLevel | null;
  }>;
  tournament: {
    code: string;
    name: string;
    stage: number;
    round: number;
    table: string;
    /** "Stage 2 · Ludo · Table 3" style label, ready to show. */
    label: string;
    bestOf: 1 | 3 | 5;
  };
  /** Who may watch: everyone, or only this tournament's entrants. */
  spectators: boolean;
  entrantUserIds: string[];
  /** Football: squads drafted at an earlier stage, by entrant. */
  squads?: Record<string, unknown>;
};
