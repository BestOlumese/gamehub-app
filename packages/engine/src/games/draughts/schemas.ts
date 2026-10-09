import { z } from "zod";
import { DRAUGHTS_TIME_PRESETS, type DraughtsRules } from "./rules";
import type { DraughtsAction } from "./state";

// Server-side validation. Kept apart so client bundles don't pull in zod.

const preset = z
  .object({ baseSeconds: z.number().int(), incrementSeconds: z.number().int() })
  .refine(
    (tc) =>
      DRAUGHTS_TIME_PRESETS.some(
        (p) => p.baseSeconds === tc.baseSeconds && p.incrementSeconds === tc.incrementSeconds,
      ),
    "not an offered time control",
  );

export const draughtsRulesSchema: z.ZodType<DraughtsRules> = z.object({
  turnSeconds: z.number().int().min(10).max(120),
  variant: z.enum(["naija10", "english8"]),
  orientation: z.enum(["naija", "fmjd"]),
  firstMove: z.enum(["random", "light", "dark"]),
  menCaptureBackward: z.boolean(),
  flyingKings: z.boolean(),
  captureRule: z.enum(["majority", "free"]),
  missedCapture: z.enum(["forced", "huff"]),
  drawRules: z.enum(["standard", "none"]),
  timeControl: preset.nullable(),
  moveLimitSeconds: z.number().int().min(60).max(900),
  abortSeconds: z.number().int().min(15).max(60),
  takebacks: z.boolean(),
});

const square = z.number().int().min(1).max(50);
const simple = (type: string) => z.object({ type: z.literal(type) });

/** What clients may send. "flag" is server-only, so it isn't here. */
export const draughtsActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move"),
    from: square,
    // A capture takes at most 20 seeds, one landing each.
    path: z.array(square).min(1).max(20),
    mt: z
      .number()
      .int()
      .min(0)
      .max(24 * 3600 * 1000)
      .optional(),
  }),
  z.object({ type: z.literal("huff"), square }),
  simple("resign"),
  simple("offer_draw"),
  simple("accept_draw"),
  simple("decline_draw"),
  simple("request_takeback"),
  simple("accept_takeback"),
  simple("decline_takeback"),
  simple("abort"),
]) as unknown as z.ZodType<DraughtsAction>;
