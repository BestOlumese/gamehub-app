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

export type BotMoveResponse =
  | { ok: true; move: string; cpuMs: number; engine: "stockfish-19-lite" }
  | { ok: false; code: "BAD_REQUEST" | "UNAUTHORIZED" | "BUSY" | "QUOTA" | "ENGINE_ERROR" | "OFF" };
