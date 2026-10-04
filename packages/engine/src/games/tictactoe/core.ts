// Browser-safe Tic-tac-toe helpers (no zod). The full GameDefinition is in ./index.ts.
import type { SeatIndex } from "../../types";
import { emptyCells, type TttAction, type TttState } from "./state";

export function tttLegalActions(s: TttState, seat: SeatIndex): TttAction[] {
  if (s.over || s.roundWinner !== null || seat !== s.turn) return [];
  return emptyCells(s.board).map((cell) => ({ type: "place", cell }));
}

export { tttNaija, type TttRules } from "./rules";
export type { TttAction, TttState, TttView } from "./state";
