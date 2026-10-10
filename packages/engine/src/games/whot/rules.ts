// Plain values and types only (no zod), so the browser can import them cheaply.

/**
 * Decking (a house rule, agreed before play): after a legal first card, keep playing more
 * cards in the same turn. "number": all share the first card's number (classic double
 * decking). "numberOrShape": all share its number, or all share its shape. "chain": each
 * card matches the one before by number or shape. A Whot can only end a deck.
 */
export type DeckMode = "off" | "number" | "numberOrShape" | "chain";

export type WhotRules = {
  /** 10–120 */
  turnSeconds: number;
  /** Cards dealt to each player, 3–8. */
  handSize: number;
  holdOn: boolean; // 1
  pickTwo: boolean; // 2
  pickThree: boolean; // 5
  suspension: boolean; // 8
  generalMarket: boolean; // 14
  /** Defend a 2 with a 2 (or a 5 with a 5); the penalty adds up. */
  stackPenalties: boolean;
  /** Defend a 2 with a 5 or a 5 with a 2. */
  crossStack: boolean;
  mustDeclareLastCard: boolean;
  /** Cards picked for forgetting to declare. */
  lastCardPenalty: number;
  /** The winning play needs a "Check up" tap. */
  checkUpRequired: boolean;
  /** Can your last card be a 1, 2, 5, 8, 14 or Whot? */
  canFinishOnSpecial: boolean;
  /** When the market runs out: count hands, or reshuffle the pile. */
  marketExhausted: "count" | "reshuffle";
  /** Does a special first call card take effect? */
  firstCardEffect: "none" | "apply";
  /** After the first player finishes: rank the rest by hand total, or play on. */
  multiWinner: "rankByCount" | "playOn";
  decking: DeckMode;
  /** A Whot blocks a Pick 2 or Pick 3 aimed at you (the penalty is gone; the Whot calls a shape). */
  whotBlocksPick: boolean;
  /**
   * Decking: right after an action card (Hold on, Pick 2, Pick 3, Suspension, General market) the
   * next card can't be a Whot. A Whot can still end a deck of normal cards (Best, Oct 2026).
   */
  noWhotAfterAction: boolean;
};

export const whotNaija: WhotRules = {
  turnSeconds: 30,
  handSize: 6,
  holdOn: true,
  pickTwo: true,
  pickThree: true,
  suspension: true,
  generalMarket: true,
  stackPenalties: true,
  crossStack: false,
  mustDeclareLastCard: true,
  lastCardPenalty: 2,
  checkUpRequired: false,
  canFinishOnSpecial: true,
  marketExhausted: "count",
  firstCardEffect: "none",
  multiWinner: "rankByCount",
  decking: "off",
  whotBlocksPick: false,
  noWhotAfterAction: false,
};
