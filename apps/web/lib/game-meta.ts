// Client-safe game names and rule summaries (no zod: imports the light engine entries).
import type { GameSlug } from "@gamehub/engine";
import type { RpsRules } from "@gamehub/engine/rps";
import type { TttRules } from "@gamehub/engine/tictactoe";
import { whotNaija, type WhotRules } from "@gamehub/engine/whot";

export const GAME_NAMES: Record<GameSlug, string> = {
  whot: "Whot",
  ludo: "Ludo",
  snakes: "Snakes & Ladders",
  tictactoe: "Tic-tac-toe",
  rps: "Rock Paper Scissors",
};

export const describeTttRules = (r: TttRules) =>
  `Best of ${r.bestOf} · ${r.turnSeconds} s turns · ${r.alternateStarter ? "starter swaps each round" : "same starter every round"}`;

export const describeRpsRules = (r: RpsRules) =>
  `${r.bestOf === 1 ? "One throw" : `Best of ${r.bestOf}`} per match · ${r.turnSeconds} s to throw`;

/** Rules that differ from Naija Standard, in plain words. */
export function whotRuleChanges(r: WhotRules): string[] {
  const n = whotNaija;
  const out: string[] = [];
  const off: Array<[keyof WhotRules, string]> = [
    ["holdOn", "Hold on"],
    ["pickTwo", "Pick 2"],
    ["pickThree", "Pick 3"],
    ["suspension", "Suspension"],
    ["generalMarket", "General market"],
  ];
  const offNames = off.filter(([k]) => !r[k]).map(([, label]) => label);
  if (offNames.length) out.push(`No ${offNames.join(", ")}`);
  if (r.stackPenalties !== n.stackPenalties)
    out.push(r.stackPenalties ? "Penalties stack" : "No defending penalties");
  if (r.crossStack && r.stackPenalties) out.push("2s and 5s mix");
  if (r.mustDeclareLastCard !== n.mustDeclareLastCard) out.push("No need to say Last card");
  else if (r.mustDeclareLastCard && r.lastCardPenalty !== n.lastCardPenalty)
    out.push(`Forget Last card: pick ${r.lastCardPenalty}`);
  if (r.checkUpRequired) out.push("Say Check up to win");
  if (!r.canFinishOnSpecial) out.push("Can't finish on a special card");
  if (r.marketExhausted === "reshuffle") out.push("Reshuffle when the market runs out");
  if (r.firstCardEffect === "apply") out.push("First card counts");
  if (r.multiWinner === "playOn") out.push("Play on for every place");
  return out;
}

export const describeWhotRules = (r: WhotRules) =>
  [
    `${r.handSize} cards each`,
    `${r.turnSeconds} s turns`,
    ...(whotRuleChanges(r).length ? whotRuleChanges(r) : ["Naija Standard"]),
  ].join(" · ");

export function describeRules(game: GameSlug, rules: unknown): string {
  if (game === "tictactoe") return describeTttRules(rules as TttRules);
  if (game === "rps") return describeRpsRules(rules as RpsRules);
  if (game === "whot") return describeWhotRules(rules as WhotRules);
  return "";
}
