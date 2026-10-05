export * from "./types";
export { ok, err } from "./result";
export { seededRng } from "./rng";
export { tictactoe, tttNaija, tttRulesSchema } from "./games/tictactoe";
export type { TttAction, TttRules, TttState, TttView } from "./games/tictactoe";
export { rps, rpsNaija, rpsRulesSchema } from "./games/rps";
export type { RpsAction, RpsRules, RpsState, RpsView, Throw } from "./games/rps";
