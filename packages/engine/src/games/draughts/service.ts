// The Hard draughts bot, for the bot service (apps/web /api/bots/draughts/move, docs/15).
// Still pure: the caller passes `stop`, which reads its own clock.
import { seededRng } from "../../rng";
import { decode, genRules, geometry } from "./board";
import { HARD, searchMove } from "./bots";
import { notation, toPublic } from "./core";
import { draughtsNaija, type DraughtsRules } from "./rules";
import type { Colour } from "./state";

export type HardMoveInput = Pick<
  DraughtsRules,
  "variant" | "menCaptureBackward" | "flyingKings" | "captureRule"
> & {
  /** The board as text (see `encode`). */
  board: string;
  turn: Colour;
};

/** The best move found before `stop()` says time is up, in notation ("28x19x10"), or null if none. */
export function hardMove(
  input: HardMoveInput,
  stop: () => boolean,
): { move: string | null; depth: number; nodes: number } {
  const { board, turn, ...rules } = input;
  const r = genRules({ ...draughtsNaija, ...rules });
  const res = searchMove(
    decode(board),
    geometry(input.variant),
    r,
    turn === "light" ? 1 : -1,
    HARD,
    seededRng(board),
    stop,
  );
  return {
    move: res.move ? notation(toPublic(res.move)) : null,
    depth: res.depth,
    nodes: res.nodes,
  };
}
