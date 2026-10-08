// Client-safe game names and rule summaries (no zod: imports the light engine entries).
import type { GameSlug } from "@gamehub/engine";
import type { FirstPlayer } from "@gamehub/protocol";
import type { RpsRules } from "@gamehub/engine/rps";
import type { TttRules } from "@gamehub/engine/tictactoe";
import { ludoNaija, type LudoRules } from "@gamehub/engine/ludo";
import { BOARDS, snakesNaija, type SnakesRules } from "@gamehub/engine/snakes";
import { whotNaija, type WhotRules } from "@gamehub/engine/whot";

export const GAME_NAMES: Record<GameSlug, string> = {
  whot: "Whot",
  ludo: "Ludo",
  snakes: "Snakes & Ladders",
  tictactoe: "Tic-tac-toe",
  rps: "Rock Paper Scissors",
};

/** Seats each game allows (matches the engines' min/maxPlayers; checked in games.test.ts). */
export const PLAYER_RANGE: Record<GameSlug, readonly [number, number]> = {
  whot: [2, 8],
  ludo: [2, 4],
  snakes: [2, 8],
  tictactoe: [2, 2],
  rps: [2, 8],
};

/** RPS players throw together, so nobody "goes first". */
export const hasFirstPlayer = (game: GameSlug) => game !== "rps";

export const FIRST_PLAYER: Record<FirstPlayer, { label: string; hint: string; short: string }> = {
  random: { label: "Random", hint: "A random player starts each game.", short: "Random" },
  rotate: {
    label: "Turns",
    hint: "The start moves one seat along each game, so everyone gets a go.",
    short: "Takes turns",
  },
  lastWinner: {
    label: "Winner",
    hint: "Whoever won the last game starts. The first game is random.",
    short: "Last winner",
  },
  seat1: { label: "Seat 1", hint: "The player in seat 1 always starts.", short: "Seat 1" },
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
  const deck = r.decking ?? "off"; // rules saved before decking existed
  if (deck !== "off")
    out.push(
      deck === "number"
        ? "Decking: same number"
        : deck === "numberOrShape"
          ? "Decking: same number or shape"
          : "Decking: chain",
    );
  return out;
}

export const describeWhotRules = (r: WhotRules) =>
  [
    `${r.handSize} cards each`,
    `${r.turnSeconds} s turns`,
    ...(whotRuleChanges(r).length ? whotRuleChanges(r) : ["Naija Standard"]),
  ].join(" · ");

/** Ludo rules that differ from Naija Standard, in plain words. */
export function ludoRuleChanges(r: LudoRules): string[] {
  const n = ludoNaija;
  const out: string[] = [];
  if (!r.needSixToLeaveYard) out.push("Any roll comes out");
  if (!r.sixRollsAgain) out.push("No extra roll on 6");
  if (r.maxConsecutiveSixes !== n.maxConsecutiveSixes)
    out.push(
      r.maxConsecutiveSixes ? `${r.maxConsecutiveSixes} sixes end your turn` : "No limit on sixes",
    );
  if (!r.captureSendsHome) out.push("No capturing");
  else if (!r.captureGivesBonusRoll) out.push("No roll for a capture");
  if (!r.safeSquares) out.push("No safe squares");
  if (r.blockades) out.push("Blockades");
  if (!r.exactRollToFinish) out.push("Overshoot home allowed");
  if (!r.homeGivesBonusRoll) out.push("No roll for getting home");
  if (!r.autoMoveSingle) out.push("No auto-move");
  if (r.endMode === "firstFinisherEnds") out.push("Ends when the first player is home");
  return out;
}

export const describeLudoRules = (r: LudoRules) =>
  [
    `${r.turnSeconds} s turns`,
    ...(ludoRuleChanges(r).length ? ludoRuleChanges(r) : ["Naija Standard"]),
  ].join(" · ");

/** Snakes & Ladders rules that differ from Naija Standard, in plain words. */
export function snakesRuleChanges(r: SnakesRules): string[] {
  const n = snakesNaija;
  const out: string[] = [];
  if (!r.sixRollsAgain) out.push("No extra roll on 6");
  else if (r.maxConsecutiveSixes !== n.maxConsecutiveSixes)
    out.push(
      r.maxConsecutiveSixes ? `${r.maxConsecutiveSixes} sixes end your turn` : "No limit on sixes",
    );
  if (r.needSixToStart) out.push("Need a 6 to start");
  if (r.bump) out.push("Bump");
  if (!r.exactRollToFinish) out.push("Overshoot 100 allowed");
  if (r.firstFinisherEnds) out.push("Ends when the first player reaches 100");
  if (r.autoRoll) out.push("Auto roll");
  return out;
}

export const describeSnakesRules = (r: SnakesRules) =>
  [
    `${BOARDS[r.board].name} board`,
    `${r.turnSeconds} s turns`,
    ...(snakesRuleChanges(r).length ? snakesRuleChanges(r) : ["Naija Standard"]),
  ].join(" · ");

export function describeRules(game: GameSlug, rules: unknown): string {
  if (game === "tictactoe") return describeTttRules(rules as TttRules);
  if (game === "rps") return describeRpsRules(rules as RpsRules);
  if (game === "whot") return describeWhotRules(rules as WhotRules);
  if (game === "ludo") return describeLudoRules(rules as LudoRules);
  if (game === "snakes") return describeSnakesRules(rules as SnakesRules);
  return "";
}
