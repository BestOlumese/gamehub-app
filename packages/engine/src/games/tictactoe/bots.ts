import { at } from "../../at";
import type { BotLevel, Rng, SeatIndex } from "../../types";
import { emptyCells, LINES, winningLine, type Cell, type TttAction, type TttState } from "./state";

const place = (cell: number): TttAction => ({ type: "place", cell });

/** Cell that completes a line for `seat`, if any. */
function finishingCell(board: readonly Cell[], seat: SeatIndex): number | null {
  for (const line of LINES) {
    const mine = line.filter((i) => board[i] === seat).length;
    const free = line.filter((i) => board[i] === null);
    if (mine === 2 && free.length === 1) return at(free, 0);
  }
  return null;
}

/** Score of `board` for `me` with `toMove` to play: +1 win, 0 draw, -1 loss. */
function minimax(board: Cell[], toMove: SeatIndex, me: SeatIndex): number {
  const line = winningLine(board);
  if (line) return board[at(line, 0)] === me ? 1 : -1;
  const free = emptyCells(board);
  if (free.length === 0) return 0;
  let best = toMove === me ? -Infinity : Infinity;
  for (const i of free) {
    board[i] = toMove as 0 | 1;
    const v = minimax(board, (1 - toMove) as SeatIndex, me);
    board[i] = null;
    best = toMove === me ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

export function easy(s: TttState, seat: SeatIndex, rng: Rng): TttAction {
  const win = finishingCell(s.board, seat);
  if (win !== null && rng.int(2) === 0) return place(win);
  const free = emptyCells(s.board);
  return place(at(free, rng.int(free.length)));
}

export function medium(s: TttState, seat: SeatIndex): TttAction {
  const win = finishingCell(s.board, seat);
  if (win !== null) return place(win);
  const block = finishingCell(s.board, (1 - seat) as SeatIndex);
  if (block !== null) return place(block);
  for (const pref of [[4], [0, 2, 6, 8], [1, 3, 5, 7]]) {
    const options = pref.filter((i) => s.board[i] === null);
    if (options.length) return place(at(options, 0));
  }
  return place(at(emptyCells(s.board), 0));
}

/** Perfect play. Picks randomly among equally good moves so it isn't predictable. */
export function hard(s: TttState, seat: SeatIndex, rng: Rng): TttAction {
  const board = s.board.slice();
  const free = emptyCells(board);
  // Opening move: any corner or the centre is optimal; skip the full search.
  if (free.length === 9) return place(at([0, 2, 4, 6, 8], rng.int(5)));
  let best = -Infinity;
  let bestCells: number[] = [];
  for (const i of free) {
    board[i] = seat as 0 | 1;
    const v = minimax(board, (1 - seat) as SeatIndex, seat);
    board[i] = null;
    if (v > best) {
      best = v;
      bestCells = [i];
    } else if (v === best) bestCells.push(i);
  }
  return place(at(bestCells, rng.int(bestCells.length)));
}

export const tttBots: Record<BotLevel, (s: TttState, seat: SeatIndex, rng: Rng) => TttAction> = {
  easy,
  medium: (s, seat) => medium(s, seat),
  hard,
};
