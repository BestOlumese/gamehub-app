export * from "./types";
export { ok, err } from "./result";
export { seededRng } from "./rng";
export { tictactoe, tttNaija, tttRulesSchema } from "./games/tictactoe";
export type { TttAction, TttRules, TttState, TttView } from "./games/tictactoe";
export { rps, rpsNaija, rpsRulesSchema } from "./games/rps";
export type { RpsAction, RpsRules, RpsState, RpsView, Throw } from "./games/rps";
export { whot, whotNaija, whotRulesSchema } from "./games/whot";
export type { Shape, WhotAction, WhotRules, WhotState, WhotView } from "./games/whot";
export { ludo, ludoNaija, ludoRulesSchema } from "./games/ludo";
export type { Colour, LudoAction, LudoRules, LudoState, LudoView } from "./games/ludo";
export { snakes, snakesNaija, snakesRulesSchema, BOARDS, BOARD_IDS } from "./games/snakes";
export type {
  Board,
  BoardId,
  SnakesAction,
  SnakesRules,
  SnakesState,
  SnakesView,
} from "./games/snakes";
export { chess, chessNaija, chessRulesSchema } from "./games/chess";
export type { ChessAction, ChessRules, ChessState, ChessView, Side } from "./games/chess";
