import { z } from "zod";
import type { WhotRules } from "./rules";
import type { WhotAction } from "./state";

const shape = z.enum(["circle", "triangle", "cross", "square", "star"]);

export const whotRulesSchema: z.ZodType<WhotRules> = z.object({
  turnSeconds: z.number().int().min(10).max(120),
  handSize: z.number().int().min(3).max(8),
  holdOn: z.boolean(),
  pickTwo: z.boolean(),
  pickThree: z.boolean(),
  suspension: z.boolean(),
  generalMarket: z.boolean(),
  stackPenalties: z.boolean(),
  crossStack: z.boolean(),
  mustDeclareLastCard: z.boolean(),
  lastCardPenalty: z.number().int().min(1).max(4),
  checkUpRequired: z.boolean(),
  canFinishOnSpecial: z.boolean(),
  marketExhausted: z.enum(["count", "reshuffle"]),
  firstCardEffect: z.enum(["none", "apply"]),
  multiWinner: z.enum(["rankByCount", "playOn"]),
  // Defaults so rules saved before decking existed (or sent by an older page) still parse.
  decking: z.enum(["off", "number", "numberOrShape", "chain"]).default("off"),
  whotBlocksPick: z.boolean().default(false),
});

export const whotActionSchema: z.ZodType<WhotAction> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("play"),
    card: z.string().regex(/^(circle|triangle|cross|square|star)-\d{1,2}$|^whot-20-[a-e]$/),
    requestShape: shape.optional(),
    checkUp: z.boolean().optional(),
  }),
  z.object({ type: z.literal("market") }),
  z.object({ type: z.literal("declare_last_card") }),
  z.object({ type: z.literal("done") }),
]);
