// Plain values and types only (no zod), so the browser can import them cheaply.

export type TttRules = {
  /** 10–120 */
  turnSeconds: number;
  bestOf: 1 | 3 | 5;
  alternateStarter: boolean;
};

export const tttNaija: TttRules = { turnSeconds: 15, bestOf: 3, alternateStarter: true };

/** Extra rounds allowed after `bestOf` when the score is level. Then it's a draw. */
export const SUDDEN_DEATH_ROUNDS = 3;
export const NEXT_ROUND_DELAY_MS = 2500;
