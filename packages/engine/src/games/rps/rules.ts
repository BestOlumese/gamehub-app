// Plain values and types only (no zod), so the browser can import them cheaply.

export type RpsRules = {
  /** 10–120 */
  turnSeconds: number;
  /** Throws to win a match: best of 1, 3 or 5. */
  bestOf: 1 | 3 | 5;
  /** After this many ties in a row, a server coin flip decides the throw. */
  maxTiesPerRound: number;
};

export const rpsNaija: RpsRules = { turnSeconds: 10, bestOf: 3, maxTiesPerRound: 5 };
