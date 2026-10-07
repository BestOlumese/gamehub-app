// Plain values and types only (no zod), so the browser can import them cheaply.
import type { BoardId } from "./boards";

export type SnakesRules = {
  /** 10–120; short by default: the only action is "roll". */
  turnSeconds: number;
  board: BoardId;
  /** Overshooting 100 means you stay where you are (off: reaching or passing 100 wins). */
  exactRollToFinish: boolean;
  sixRollsAgain: boolean;
  /** This many sixes in a row loses the turn without moving (0 = no limit). */
  maxConsecutiveSixes: number;
  /** A token comes onto the board only on a 6. */
  needSixToStart: boolean;
  /** Landing on someone's square sends them back to the start. */
  bump: boolean;
  /** The game ends when the first player reaches 100 (others ranked by square). */
  firstFinisherEnds: boolean;
  /** Rolls happen by themselves after a short pause (nobody needs to tap). */
  autoRoll: boolean;
};

export const snakesNaija: SnakesRules = {
  turnSeconds: 15,
  board: "naija-classic",
  exactRollToFinish: true,
  sixRollsAgain: true,
  maxConsecutiveSixes: 3,
  needSixToStart: false,
  bump: false,
  firstFinisherEnds: false,
  autoRoll: false,
};
