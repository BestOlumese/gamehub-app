import { z } from "zod";
import type { RpsRules } from "./rules";
import type { RpsAction } from "./state";

export const rpsRulesSchema: z.ZodType<RpsRules> = z.object({
  turnSeconds: z.number().int().min(10).max(120),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  maxTiesPerRound: z.number().int().min(1).max(10),
});

export const rpsActionSchema: z.ZodType<RpsAction> = z.object({
  type: z.literal("throw"),
  pick: z.enum(["rock", "paper", "scissors"]),
});
