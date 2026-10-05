import { z } from "zod";
import type { LudoRules } from "./rules";
import type { LudoAction } from "./state";

// Server-side validation. Kept apart so client bundles don't pull in zod.

export const ludoRulesSchema: z.ZodType<LudoRules> = z.object({
  turnSeconds: z.number().int().min(10).max(120),
  needSixToLeaveYard: z.boolean(),
  sixRollsAgain: z.boolean(),
  // 0 = no limit; 1 would forfeit every six, so the smallest limit is 2.
  maxConsecutiveSixes: z.union([z.literal(0), z.number().int().min(2).max(5)]),
  captureGivesBonusRoll: z.boolean(),
  homeGivesBonusRoll: z.boolean(),
  exactRollToFinish: z.boolean(),
  safeSquares: z.boolean(),
  blockades: z.boolean(),
  captureSendsHome: z.boolean(),
  autoMoveSingle: z.boolean(),
  endMode: z.enum(["playOn", "firstFinisherEnds"]),
});

export const ludoActionSchema: z.ZodType<LudoAction> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("roll") }),
  z.object({ type: z.literal("move"), seed: z.number().int().min(0).max(3) }),
]);
