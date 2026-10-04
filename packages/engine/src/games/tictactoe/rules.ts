import { z } from "zod";

export const tttRulesSchema = z.object({
  turnSeconds: z.number().int().min(10).max(120),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  alternateStarter: z.boolean(),
});

export type TttRules = z.infer<typeof tttRulesSchema>;

export const tttNaija: TttRules = { turnSeconds: 15, bestOf: 3, alternateStarter: true };

/** Extra rounds allowed after `bestOf` when the score is level. Then it's a draw. */
export const SUDDEN_DEATH_ROUNDS = 3;
export const NEXT_ROUND_DELAY_MS = 2500;
