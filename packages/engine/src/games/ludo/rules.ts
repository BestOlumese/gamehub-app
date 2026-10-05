// Plain values and types only (no zod), so the browser can import them cheaply.

export type LudoRules = {
  /** 10–120 */
  turnSeconds: number;
  /** A seed leaves the yard only on a 6 (otherwise any roll brings one out). */
  needSixToLeaveYard: boolean;
  /** A 6 earns another roll. */
  sixRollsAgain: boolean;
  /** This many 6s in a row forfeits the turn (0 = no limit). */
  maxConsecutiveSixes: number;
  captureGivesBonusRoll: boolean;
  /** Bringing a seed home earns another roll. */
  homeGivesBonusRoll: boolean;
  /** No overshooting home: the roll must fit exactly. */
  exactRollToFinish: boolean;
  /** Start squares and the four stars can't be captured on. */
  safeSquares: boolean;
  /** Two seeds of one colour on a square block others from passing or landing. */
  blockades: boolean;
  /** Landing on a rival sends it back to its yard. Off: seeds share squares, no capturing. */
  captureSendsHome: boolean;
  /** Only one seed can move: it moves by itself. */
  autoMoveSingle: boolean;
  /** After the first player is home: play on for every place, or end and rank by progress. */
  endMode: "playOn" | "firstFinisherEnds";
};

export const ludoNaija: LudoRules = {
  turnSeconds: 30,
  needSixToLeaveYard: true,
  sixRollsAgain: true,
  maxConsecutiveSixes: 3,
  captureGivesBonusRoll: true,
  homeGivesBonusRoll: true,
  exactRollToFinish: true,
  safeSquares: true,
  blockades: false,
  captureSendsHome: true,
  autoMoveSingle: true,
  endMode: "playOn",
};
