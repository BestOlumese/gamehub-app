import type { GameSlug, RuleErrorCode, SeatIndex } from "@gamehub/engine";
import { z } from "zod";
import { gameSlugSchema } from "./game-slug";

// ── Shared shapes ────────────────────────────────────────────────────────────

export const botLevelSchema = z.enum(["easy", "medium", "hard"]);
export type BotLevel = z.infer<typeof botLevelSchema>;

/** Who moves first in each game: random, one seat along each game, the last winner, or seat 1. */
export const firstPlayerSchema = z.enum(["random", "rotate", "lastWinner", "seat1"]);
export type FirstPlayer = z.infer<typeof firstPlayerSchema>;

export const seatStatusSchema = z.enum(["empty", "connected", "away", "bot", "left"]);
export type SeatStatus = z.infer<typeof seatStatusSchema>;

export type TicketScope = "presence" | `match:${string}` | `room:${string}`;

export type TicketClaims = {
  sub: string;
  name: string;
  avatar: string | null;
  scope: TicketScope;
};

/** What every client may know about a seat. */
export type SeatPublic = {
  index: SeatIndex;
  userId: string | null;
  name: string;
  avatar: string | null;
  status: SeatStatus;
  botLevel: BotLevel | null;
  ready: boolean;
  host: boolean;
  /** Naija Plots: the token this person picked in the lobby (null: not picked; bots never pick). */
  token?: number | null;
};

export type RoomPhase = "lobby" | "playing" | "ended";

export type RoomMeta = {
  roomId: string;
  code: string | null;
  kind: "private" | "quick";
  game: GameSlug;
  phase: RoomPhase;
  ranked: boolean;
  rules: unknown;
  /** Seats the game will have when it starts. */
  size: number;
  /** The game's minimum players; with no bot fill, the host can start once this many are in. */
  minPlayers: number;
  /** Bots that take any empty seats when the host starts, or null. */
  botFill: BotLevel | null;
  firstPlayer: FirstPlayer;
};

// ── Client → server ──────────────────────────────────────────────────────────

const id = z.string().min(1).max(64);

export const clientRoomMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), lastV: z.number().int().nonnegative().optional() }),
  z.object({ t: z.literal("act"), id, v: z.number().int().nonnegative(), a: z.unknown() }),
  z.object({ t: z.literal("ready"), ready: z.boolean() }),
  /** Naija Plots: pick your token in the lobby (one per person, first come first served). */
  z.object({ t: z.literal("token"), token: z.number().int().min(0).max(7) }),
  // Host, lobby only: the room's whole setup, as the setup sheet sends it.
  z.object({
    t: z.literal("config"),
    game: gameSlugSchema,
    rules: z.unknown(),
    players: z.number().int().min(2).max(8),
    botLevel: botLevelSchema.nullable(),
    firstPlayer: firstPlayerSchema,
    /** Seat bots in the empty seats now ("play a bot" in a 2-player room). */
    seatBotsNow: z.boolean().default(false),
  }),
  z.object({ t: z.literal("shuffle") }),
  z.object({
    t: z.literal("seat_bot"),
    seat: z.number().int().min(0).max(7),
    level: botLevelSchema.nullable(),
  }),
  z.object({ t: z.literal("kick"), seat: z.number().int().min(0).max(7) }),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("rematch") }),
  z.object({ t: z.literal("leave") }),
  z.object({ t: z.literal("ping"), c: z.number() }),
]);
export type ClientRoomMsg = z.infer<typeof clientRoomMsg>;

// ── Server → client ──────────────────────────────────────────────────────────

export type Deadlines = {
  /** Per-seat turn deadlines (server time). Several seats can be due at once in RPS brackets. */
  turns?: Partial<Record<SeatIndex, number>>;
  graceEndsAt?: Partial<Record<SeatIndex, number>>;
};

export type RoomErrorCode =
  | "UNAUTHORIZED"
  | "ROOM_FULL"
  | "NOT_FOUND"
  | "CAPACITY"
  | "RATE_LIMIT"
  | "BAD_MESSAGE"
  | "NOT_HOST"
  | "NOT_ENOUGH_PLAYERS"
  /** More people are seated than the chosen game or seat count allows. */
  | "TOO_MANY_PLAYERS"
  | "WRONG_PHASE";

export type ServerRoomMsg =
  | {
      t: "snapshot";
      v: number;
      room: RoomMeta;
      seats: SeatPublic[];
      you: SeatIndex | "spectator";
      view: unknown;
      deadlines: Deadlines;
      serverNow: number;
    }
  | { t: "ack"; id: string; v: number }
  | { t: "reject"; id: string; code: RuleErrorCode; v: number }
  | { t: "event"; v: number; e: { type: string } & Record<string, unknown> }
  | { t: "ended"; v: number; ranking: SeatIndex[][]; ranked: boolean }
  | { t: "pong"; c: number; s: number }
  | { t: "error"; code: RoomErrorCode };

/** Light runtime check on the client: the server is trusted, but frames can be garbage. */
export const serverRoomMsg = z.looseObject({ t: z.string() });

// ── Room creation (web → Worker, HMAC-signed) ────────────────────────────────

export const createRoomRequest = z.object({
  game: gameSlugSchema,
  rules: z.unknown(),
  /** Bots for empty seats when the host starts; null = wait for humans. */
  botLevel: botLevelSchema.nullable(),
  /** Seats for this room (2–8, clamped to the game's range). Defaults to the game's maximum. */
  players: z.number().int().min(2).max(8).optional(),
  /** Put bots in every empty seat now ("play a bot"), rather than only when the host starts. */
  seatBotsNow: z.boolean().default(false),
  firstPlayer: firstPlayerSchema.default("random"),
  host: z.object({
    userId: z.string().min(1),
    name: z.string().min(1),
    avatar: z.string().nullable(),
  }),
});
export type CreateRoomRequest = z.infer<typeof createRoomRequest>;

export type CreateRoomResponse = { roomId: string; code: string };
