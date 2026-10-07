import { z } from "zod";
import { BOARD_IDS } from "./boards";
import type { SnakesRules } from "./rules";
import type { SnakesAction } from "./state";

// Server-side validation. Kept apart so client bundles don't pull in zod.

export const snakesRulesSchema: z.ZodType<SnakesRules> = z.object({
  turnSeconds: z.number().int().min(10).max(120),
  board: z.enum(BOARD_IDS as [string, ...string[]]) as z.ZodType<SnakesRules["board"]>,
  exactRollToFinish: z.boolean(),
  sixRollsAgain: z.boolean(),
  // 0 = no limit; 1 would forfeit every six, so the smallest limit is 2.
  maxConsecutiveSixes: z.union([z.literal(0), z.number().int().min(2).max(5)]),
  needSixToStart: z.boolean(),
  bump: z.boolean(),
  firstFinisherEnds: z.boolean(),
  autoRoll: z.boolean(),
});

export const snakesActionSchema: z.ZodType<SnakesAction> = z.object({ type: z.literal("roll") });
