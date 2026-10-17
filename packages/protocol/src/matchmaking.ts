// Quick-match socket and match results (docs/08-matchmaking-ratings.md).
import { z } from "zod";
import { gameSlugSchema } from "./game-slug";
import { tournamentMatchSchema } from "./tournament";

const timeControl = z.object({
  baseSeconds: z.number().int().min(30).max(3600),
  incrementSeconds: z.number().int().min(0).max(60),
});

export const queueSpecSchema = z.object({
  game: gameSlugSchema,
  players: z.number().int().min(2).max(8),
  timeControl: timeControl.nullable().optional(),
  variant: z.enum(["naija10", "english8"]).nullable().optional(),
});
export type QueueSpecMsg = z.infer<typeof queueSpecSchema>;

export const clientMatchMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("mm_hello") }),
  z.object({ t: z.literal("mm_join"), queue: queueSpecSchema }),
  /** Opt out of (or back into) bots filling the seats after 20 s. */
  z.object({ t: z.literal("mm_wait"), keep: z.boolean() }),
  z.object({ t: z.literal("mm_leave") }),
  z.object({ t: z.literal("ping"), c: z.number() }),
]);
export type ClientMatchMsg = z.infer<typeof clientMatchMsg>;

export type QueueStatus =
  /** Not queued. */
  | { status: "idle" }
  | {
      status: "queued";
      queue: string;
      game: z.infer<typeof gameSlugSchema>;
      size: number;
      ranked: boolean;
      /** People waiting in this queue now (you first). */
      found: Array<{ name: string; avatar: string | null; you: boolean }>;
      joinedAt: number;
      /** When bots fill the seats (server time), or null if you chose to keep waiting. */
      botsAt: number | null;
      /** Keep waiting: you're dropped from the queue at this time. */
      giveUpAt: number | null;
    }
  /** In a game already: one at a time. */
  | { status: "busy"; code: string }
  /** Nobody came while you kept waiting. */
  | { status: "timed_out" };

export type ServerMatchMsg =
  | ({ t: "mm_state"; serverNow: number } & QueueStatus)
  /** Found: go to /r/<code>. */
  | { t: "mm_go"; code: string; ranked: boolean }
  | { t: "error"; code: "BAD_MESSAGE" | "RATE_LIMIT" | "BAD_QUEUE" | "BUSY" }
  | { t: "pong"; c: number; s: number };

/** A finished game in a room, to web (HMAC). Tournament tables report through their tournament. */
export const matchResultSchema = tournamentMatchSchema.extend({
  kind: z.enum(["private", "quick"]),
  ranked: z.boolean(),
  /** Rating pool within the game ("standard", chess "blitz", draughts "naija10"…). */
  variant: z.string().min(1).max(20),
  timeControl: z.string().max(10).nullable(),
  // A football solo run has one person (and bot XIs inside the game).
  playerCount: z.number().int().min(1).max(8),
  players: z.array(tournamentMatchSchema.shape.players.element).min(1).max(8),
  /** Football solo run: how far it went (the profile shows the best run). */
  solo: z
    .object({
      wins: z.number().int().min(0).max(10),
      played: z.number().int().min(1).max(10),
      teamRating: z.number().int().min(0).max(99),
      luck: z.string().max(20),
      dataVersion: z.string().max(20),
    })
    .optional(),
});
export type MatchResult = z.infer<typeof matchResultSchema>;
