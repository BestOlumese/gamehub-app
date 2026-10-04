import { z } from "zod";
import type { TttRules } from "./rules";
import type { TttAction } from "./state";

// Server-side validation. Kept apart so client bundles don't pull in zod.

export const tttRulesSchema: z.ZodType<TttRules> = z.object({
  turnSeconds: z.number().int().min(10).max(120),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  alternateStarter: z.boolean(),
});

export const tttActionSchema: z.ZodType<TttAction> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("place"), cell: z.number().int().min(0).max(8) }),
  z.object({ type: z.literal("next_round") }),
]);
