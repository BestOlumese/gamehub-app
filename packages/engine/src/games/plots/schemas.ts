import { z } from "zod";
import type { PlotsRules } from "./rules";
import type { PlotsAction } from "./state";

// Server-side validation. Kept apart so client bundles don't pull in zod.

export const plotsRulesSchema: z.ZodType<PlotsRules> = z.object({
  turnSeconds: z.number().int().min(10).max(120),
  mode: z.enum(["timed", "classic"]),
  timedMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  classicCapHours: z.number().int().min(1).max(3),
  startCash: z.number().int().min(500).max(5000),
  salary: z.number().int().min(0).max(1000),
  doublesRollAgain: z.boolean(),
  threeDoublesToPolice: z.boolean(),
  policeFine: z.number().int().min(0).max(500),
  maxDetainedTurns: z.number().int().min(1).max(5),
  rentWhileDetained: z.boolean(),
  groupRentMultiplier: z.union([z.literal(1), z.literal(2)]),
  evenBuilding: z.boolean(),
  houseSupply: z.number().int().min(12).max(88),
  hotelSupply: z.number().int().min(4).max(22),
  mortgageInterestPct: z.number().int().min(0).max(50),
  mortgageTransferInterest: z.enum(["immediate", "on_unmortgage"]),
  auctions: z.boolean(),
  auctionSecondsPerBid: z.number().int().min(5).max(20),
  minBidIncrement: z.number().int().min(5).max(100),
  trading: z.boolean(),
  owambeJackpot: z.boolean(),
  doubleSalaryOnExactLanding: z.boolean(),
});

const space = z.number().int().min(0).max(39);
const seat = z.number().int().min(0).max(7);
const bundle = z.object({
  cash: z.number().int().min(0).max(1_000_000),
  plots: z.array(space).max(28),
  bail: z.number().int().min(0).max(2),
});
const simple = (type: string) => z.object({ type: z.literal(type) });

/** What clients may send. "auto_pay" is server-only, so it isn't here. */
export const plotsActionSchema = z.discriminatedUnion("type", [
  simple("roll"),
  simple("pay_fine"),
  simple("use_bail"),
  simple("buy"),
  simple("decline"),
  z.object({ type: z.literal("bid"), amount: z.number().int().min(1).max(1_000_000) }),
  simple("pass_bid"),
  z.object({ type: z.literal("build"), space }),
  z.object({ type: z.literal("sell_building"), space }),
  z.object({ type: z.literal("mortgage"), space }),
  z.object({ type: z.literal("unmortgage"), space }),
  z.object({ type: z.literal("offer"), to: seat, give: bundle, get: bundle }),
  z.object({ type: z.literal("accept_offer"), id: z.number().int().min(0) }),
  z.object({ type: z.literal("decline_offer"), id: z.number().int().min(0) }),
  z.object({ type: z.literal("cancel_offer"), id: z.number().int().min(0) }),
  simple("declare_bankruptcy"),
  simple("end_turn"),
]) as unknown as z.ZodType<PlotsAction>;
