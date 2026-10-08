import { z } from "zod";
import { TIME_PRESETS, type ChessRules } from "./rules";
import type { ChessAction } from "./state";

// Server-side validation. Kept apart so client bundles don't pull in zod.

const preset = z
  .object({ baseSeconds: z.number().int(), incrementSeconds: z.number().int() })
  .refine(
    (tc) =>
      TIME_PRESETS.some(
        (p) => p.baseSeconds === tc.baseSeconds && p.incrementSeconds === tc.incrementSeconds,
      ),
    "not an offered time control",
  );

export const chessRulesSchema: z.ZodType<ChessRules> = z.object({
  turnSeconds: z.number().int().min(10).max(120),
  timeControl: preset.nullable(),
  moveLimitSeconds: z.number().int().min(60).max(900),
  drawClaims: z.enum(["auto", "claim"]),
  takebacks: z.boolean(),
  premoves: z.boolean(),
  abortSeconds: z.number().int().min(15).max(60),
  autoQueenPremove: z.boolean(),
});

const simple = (type: string) => z.object({ type: z.literal(type) });

/** What clients may send. "flag" is server-only, so it isn't here. */
export const chessActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move"),
    uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
    mt: z
      .number()
      .int()
      .min(0)
      .max(24 * 3600 * 1000)
      .optional(),
  }),
  simple("resign"),
  simple("offer_draw"),
  simple("accept_draw"),
  simple("decline_draw"),
  simple("claim_draw"),
  simple("request_takeback"),
  simple("accept_takeback"),
  simple("decline_takeback"),
  simple("abort"),
]) as unknown as z.ZodType<ChessAction>;
