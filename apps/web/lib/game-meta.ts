// Client-safe game names and rule summaries (no zod: imports the light engine entries).
import type { GameSlug } from "@gamehub/engine";
import type { FirstPlayer } from "@gamehub/protocol";
import type { RpsRules } from "@gamehub/engine/rps";
import type { TttRules } from "@gamehub/engine/tictactoe";
import { ludoNaija, type LudoRules } from "@gamehub/engine/ludo";
import { chessNaija, timeLabel, type ChessRules } from "@gamehub/engine/chess";
import { draughtsNaija, effective, type DraughtsRules } from "@gamehub/engine/draughts";
import { naira, plotsNaija, type PlotsRules } from "@gamehub/engine/plots";
import { BOARDS, snakesNaija, type SnakesRules } from "@gamehub/engine/snakes";
import { whotNaija, type WhotRules } from "@gamehub/engine/whot";

export const GAME_NAMES: Record<GameSlug, string> = {
  whot: "Whot",
  ludo: "Ludo",
  snakes: "Snakes & Ladders",
  tictactoe: "Tic-tac-toe",
  rps: "Rock Paper Scissors",
  chess: "Chess",
  draughts: "Draft",
  plots: "Naija Plots",
};

/** Seats each game allows (matches the engines' min/maxPlayers; checked in games.test.ts). */
export const PLAYER_RANGE: Record<GameSlug, readonly [number, number]> = {
  whot: [2, 8],
  ludo: [2, 4],
  snakes: [2, 8],
  tictactoe: [2, 2],
  rps: [2, 8],
  chess: [2, 2],
  draughts: [2, 2],
  plots: [2, 8],
};

/** RPS players throw together, so nobody "goes first". */
export const hasFirstPlayer = (game: GameSlug) => game !== "rps";

/** `whiteHint`: the same choice in chess, where going first means playing White. */
export const FIRST_PLAYER: Record<
  FirstPlayer,
  { label: string; hint: string; whiteHint: string; short: string }
> = {
  random: {
    label: "Random",
    hint: "A random player starts each game.",
    whiteHint: "A random player gets White each game.",
    short: "Random",
  },
  rotate: {
    label: "Turns",
    hint: "The start moves one seat along each game, so everyone gets a go.",
    whiteHint: "Colours swap every game.",
    short: "Takes turns",
  },
  lastWinner: {
    label: "Winner",
    hint: "Whoever won the last game starts. The first game is random.",
    whiteHint: "Whoever won the last game plays White. The first game is random.",
    short: "Last winner",
  },
  seat1: {
    label: "Seat 1",
    hint: "The player in seat 1 always starts.",
    whiteHint: "The player in seat 1 always plays White.",
    short: "Seat 1",
  },
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
  if (r.whotBlocksPick) out.push("Whot blocks picks");
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

/** Chess rules that differ from Naija Standard, in plain words. */
export function chessRuleChanges(r: ChessRules): string[] {
  const out: string[] = [];
  if (!r.takebacks) out.push("No takebacks");
  if (!r.premoves) out.push("No premoves");
  if (r.drawClaims === "claim") out.push("Draws by repetition are claimed");
  if (!r.timeControl && r.moveLimitSeconds !== chessNaija.moveLimitSeconds)
    out.push(`${r.moveLimitSeconds / 60} min a move`);
  return out;
}

export const describeChessRules = (r: ChessRules) =>
  [
    timeLabel(r.timeControl),
    ...(chessRuleChanges(r).length ? chessRuleChanges(r) : ["Naija Standard"]),
  ].join(" · ");

/** Draft colours: light seeds are red bottle caps, dark ones green (decided with Best, Oct 2026). */
export const DRAUGHTS_COLOUR = { light: "Red", dark: "Green" } as const;

export const draughtsVariantName = (r: Pick<DraughtsRules, "variant">) =>
  r.variant === "naija10" ? "Naija draft 10×10" : "English checkers 8×8";

/** Draft rules that differ from Naija Standard (or, for English checkers, from its own rules). */
export function draughtsRuleChanges(rules: DraughtsRules): string[] {
  const r = effective(rules);
  const n = draughtsNaija;
  const out: string[] = [];
  if (r.variant === "naija10") {
    if (r.captureRule === "majority") out.push("Take the most");
    if (!r.menCaptureBackward) out.push("Men take forward only");
    if (!r.flyingKings) out.push("Short kings");
    if (r.orientation === "fmjd") out.push("FMJD board");
    if (r.firstMove !== "random") out.push(`${DRAUGHTS_COLOUR[r.firstMove]} moves first`);
  }
  if (r.missedCapture === "huff") out.push("Huffing");
  if (r.drawRules === "none") out.push("No move-count draws");
  if (!r.takebacks) out.push("No takebacks");
  if (!r.timeControl && r.moveLimitSeconds !== n.moveLimitSeconds)
    out.push(`${r.moveLimitSeconds / 60} min a move`);
  return out;
}

export const describeDraughtsRules = (r: DraughtsRules) =>
  [
    draughtsVariantName(r),
    timeLabel(r.timeControl),
    ...(draughtsRuleChanges(r).length
      ? draughtsRuleChanges(r)
      : r.variant === "naija10"
        ? ["Naija Standard"]
        : []),
  ].join(" · ");

/** Naija Plots rules that differ from Naija Standard, in plain words. */
export function plotsRuleChanges(r: PlotsRules): string[] {
  const n = plotsNaija;
  const out: string[] = [];
  if (r.startCash !== n.startCash) out.push(`Start with ${naira(r.startCash)}`);
  if (r.salary !== n.salary) out.push(`Salary ${naira(r.salary)}`);
  if (!r.auctions) out.push("No auctions");
  if (!r.trading) out.push("No trading");
  if (!r.doublesRollAgain) out.push("No extra roll on doubles");
  if (!r.threeDoublesToPolice) out.push("Three doubles are fine");
  if (!r.evenBuilding) out.push("Build in any order");
  if (!r.rentWhileDetained) out.push("No rent at the Police Post");
  if (r.owambeJackpot) out.push("Owambe jackpot");
  if (r.doubleSalaryOnExactLanding) out.push("Double salary on Payday");
  return out;
}

export const describePlotsRules = (r: PlotsRules) =>
  [
    r.mode === "timed" ? `Timed, ${r.timedMinutes} min` : "Last one standing",
    `${r.turnSeconds} s actions`,
    ...(plotsRuleChanges(r).length ? plotsRuleChanges(r) : ["Naija Standard"]),
  ].join(" · ");

export function describeRules(game: GameSlug, rules: unknown): string {
  if (game === "tictactoe") return describeTttRules(rules as TttRules);
  if (game === "rps") return describeRpsRules(rules as RpsRules);
  if (game === "whot") return describeWhotRules(rules as WhotRules);
  if (game === "ludo") return describeLudoRules(rules as LudoRules);
  if (game === "snakes") return describeSnakesRules(rules as SnakesRules);
  if (game === "chess") return describeChessRules(rules as ChessRules);
  if (game === "draughts") return describeDraughtsRules(rules as DraughtsRules);
  if (game === "plots") return describePlotsRules(rules as PlotsRules);
  return "";
}
