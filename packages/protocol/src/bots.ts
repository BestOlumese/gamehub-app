import { z } from "zod";

// Room DO → bot service (apps/web /api/bots/*), HMAC-signed with BOT_HMAC_SECRET
// (docs/15-bot-service.md). Never called from browsers.

/** Requests bigger than this are refused before any parsing. */
export const BOT_MAX_BODY = 4096;

export const botMoveRequest = z.object({
  game: z.literal("chess"),
  level: z.enum(["medium", "hard"]),
  /** FEN at the last irreversible move (pawn move or capture)… */
  position: z.string().min(10).max(200),
  /** …and the UCI moves since, so the engine sees repetitions. */
  history: z
    .array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/))
    .max(150)
    .default([]),
  movetimeMs: z.number().int().min(20).max(300),
  /** For logs and abuse limits only. */
  roomId: z.string().max(16),
});
export type BotMoveRequest = z.infer<typeof botMoveRequest>;

/** Hard draughts (our own search, run where there's CPU time to spare). */
export const draughtsBotRequest = z
  .object({
    game: z.literal("draughts"),
    level: z.literal("hard"),
    variant: z.enum(["naija10", "english8"]),
    /** The board as text, one character a square ("." empty, l/L light man/king, d/D dark). */
    board: z.string().regex(/^[.lLdD]+$/),
    turn: z.enum(["light", "dark"]),
    menCaptureBackward: z.boolean(),
    flyingKings: z.boolean(),
    captureRule: z.enum(["majority", "free"]),
    movetimeMs: z.number().int().min(20).max(300),
    roomId: z.string().max(16),
  })
  .refine((r) => r.board.length === (r.variant === "naija10" ? 50 : 32), "board size");
export type DraughtsBotRequest = z.infer<typeof draughtsBotRequest>;

export type BotMoveResponse =
  /** `move`: UCI for chess, notation ("28x19x10") for draughts. */
  | { ok: true; move: string; cpuMs: number; engine: "stockfish-19-lite" | "gamehub-draughts" }
  | { ok: false; code: "BAD_REQUEST" | "UNAUTHORIZED" | "BUSY" | "QUOTA" | "ENGINE_ERROR" | "OFF" };
