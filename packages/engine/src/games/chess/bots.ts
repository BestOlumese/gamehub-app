// Built-in chess bots (ours, MIT). Easy plays in the room itself; Medium and Hard normally come
// from the bot service (Stockfish, docs/15-bot-service.md) and fall back to "Easy+" here.
// Budgets count positions, not time: Date.now() doesn't move during CPU work in a Worker.
import type { Rng } from "../../types";
import {
  B,
  BLACK,
  Board,
  isCapture,
  K,
  N,
  P,
  Q,
  R,
  toUci,
  type Move,
  moveFrom,
  moveTo,
  movePromo,
} from "./movegen";

const VALUE = [0, 100, 320, 330, 500, 900, 0];

// Piece-square tables (Tomasz Michniewski's "simplified evaluation"), a1..h8 from White's side.
// Rows below are written rank 8 first, so they're flipped when read.
const RAW: Record<number, number[]> = {
  [P]: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5,
    10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20,
    -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  [N]: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10,
    0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10,
    5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  [B]: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0,
    -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  [R]: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0,
    5, 5, 0, 0, 0,
  ],
  [Q]: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0,
    0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  [K]: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
    -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
    -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
    10, 30, 20,
  ],
};
/** PST[type][0x88 square] for White; Black reads the mirrored square. */
/** Piece value + square bonus in one flat table: SCORE[type * 128 + square], White's view. */
const SCORE = new Int16Array(7 * 128);
for (const t of [P, N, B, R, Q, K]) {
  const raw = RAW[t] as number[];
  for (let rank = 0; rank < 8; rank++)
    for (let file = 0; file < 8; file++)
      SCORE[t * 128 + rank * 16 + file] =
        (VALUE[t] as number) + (raw[(7 - rank) * 8 + file] as number);
}
const WORTH = Int16Array.from(VALUE);

const MATE = 100_000;
const Q_DEPTH = 4;
const DELTA_MARGIN = 200;

/** Score from the side to move's point of view. */
function evaluate(b: Board): number {
  let score = 0;
  const s = b.sq;
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) {
      i += 7;
      continue;
    }
    const p = s[i] as number;
    if (!p) continue;
    if (p & BLACK) score -= SCORE[(p & 7) * 128 + (i ^ 0x70)] as number;
    else score += SCORE[p * 128 + i] as number;
  }
  return b.side === 0 ? score : -score;
}

/**
 * In place: captures and promotions first (most valuable victim, least valuable attacker),
 * quiet moves after in generation order. Insertion sort on a short prefix: no allocations.
 */
function order(b: Board, moves: Move[]): Move[] {
  const key = (m: Move) =>
    (isCapture(m)
      ? 10 * ((WORTH[(b.sq[moveTo(m)] as number) & 7] as number) || 100) -
        ((WORTH[(b.sq[moveFrom(m)] as number) & 7] as number) >> 3)
      : 0) + (movePromo(m) ? 800 : 0);
  let n = 0; // moves[0..n) are the noisy ones, kept sorted by key
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i] as Move;
    const k = key(m);
    if (!k) continue;
    moves[i] = moves[n] as Move;
    let j = n++;
    while (j > 0 && key(moves[j - 1] as Move) < k) {
      moves[j] = moves[j - 1] as Move;
      j--;
    }
    moves[j] = m;
  }
  return moves;
}

/** Thrown when the position budget runs out; one shared value (an Error would build a stack trace). */
const OUT_OF_NODES = Symbol("out of nodes");

class Search {
  nodes = 0;
  constructor(private readonly budget: number) {}

  private tick() {
    if (++this.nodes > this.budget) throw OUT_OF_NODES;
  }

  /**
   * Captures only, so a move isn't judged in the middle of an exchange. Bounded: at most
   * Q_DEPTH captures deep, and captures that can't lift the score to alpha even if the
   * piece were free (delta pruning) are skipped. Keeps tactical positions from eating the budget.
   */
  quiesce(b: Board, alpha: number, beta: number, qDepth = 0): number {
    this.tick();
    const stand = evaluate(b);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qDepth >= Q_DEPTH) return alpha;
    for (const m of order(b, b.pseudo(true))) {
      const gain = (WORTH[(b.sq[moveTo(m)] as number) & 7] as number) + (movePromo(m) ? 800 : 0);
      if (stand + gain + DELTA_MARGIN < alpha) continue;
      b.make(m);
      if (b.leftKingInCheck()) {
        b.unmake();
        continue;
      }
      const score = -this.quiesce(b, -beta, -alpha, qDepth + 1);
      b.unmake();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  negamax(b: Board, depth: number, alpha: number, beta: number, height: number): number {
    if (depth === 0) return this.quiesce(b, alpha, beta);
    this.tick();
    // Legality is checked only for moves actually tried (most are cut off before that).
    let legal = 0;
    for (const m of order(b, b.pseudo(false))) {
      b.make(m);
      if (b.leftKingInCheck()) {
        b.unmake();
        continue;
      }
      legal++;
      const score = -this.negamax(b, depth - 1, -beta, -alpha, height + 1);
      b.unmake();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    if (!legal) return b.inCheck() ? -MATE + height : 0;
    return alpha;
  }

  /**
   * Scores root moves at `depth` (full window, so scores compare fairly), pushing each into
   * `out` as it's done: if the budget runs out partway, the moves scored so far still count.
   */
  scoreRoot(b: Board, moves: Move[], depth: number, out: Array<{ move: Move; score: number }>) {
    for (const move of moves) {
      b.make(move);
      try {
        out.push({ move, score: -this.negamax(b, depth - 1, -MATE - 1, MATE + 1, 1) });
      } finally {
        b.unmake();
      }
    }
  }
}

export type BotStyle = {
  /** Positions the search may look at. */
  budget: number;
  maxDepth: number;
  /** Chance of playing the 2nd or 3rd best move instead of the best. */
  slip: number;
};

// Budgets fit the Workers Free CPU limit (10 ms per invocation) with room for the move itself
// (~2-4 ms): measured in Node at ~9 µs a position, p95 4.5 ms (Easy) and 5.5 ms (Easy+).
/** Easy: one move ahead plus captures, 400 positions, a slip one move in five. */
export const EASY: BotStyle = { budget: 400, maxDepth: 1, slip: 0.2 };
/** "Easy+": the fallback when the bot service can't answer. Two moves ahead when it can, never slips. */
export const EASY_PLUS: BotStyle = { budget: 500, maxDepth: 2, slip: 0 };

/** A move (UCI) for the side to move, or null if there's none. */
export function botMove(fen: string, style: BotStyle, rng: Rng): string | null {
  return searchMove(fen, style, rng).uci;
}

/** botMove plus how deep the search got and how many positions it used (tests, tuning). */
export function searchMove(
  fen: string,
  style: BotStyle,
  rng: Rng,
): { uci: string | null; depth: number; nodes: number } {
  const b = Board.fromFen(fen);
  const moves = b.moves();
  if (!moves.length) return { uci: null, depth: 0, nodes: 0 };
  if (moves.length === 1) return { uci: toUci(moves[0] as Move), depth: 0, nodes: 0 };
  const search = new Search(style.budget);
  let ranked: Array<{ move: Move; score: number }> = order(b, moves).map((move) => ({
    move,
    score: 0,
  }));
  // Iterative deepening: keep the last depth that finished inside the budget. If even depth 1
  // runs out, the moves it did score (captures first, so the tactics) are ranked first.
  let depthDone = 0;
  for (let depth = 1; depth <= style.maxDepth; depth++) {
    const scored: Array<{ move: Move; score: number }> = [];
    try {
      search.scoreRoot(
        b,
        ranked.map((x) => x.move),
        depth,
        scored,
      );
      ranked = scored.sort((x, y) => y.score - x.score);
      depthDone = depth;
    } catch (e) {
      if (e !== OUT_OF_NODES) throw e;
      if (depth === 1 && scored.length) {
        const done = new Set(scored.map((x) => x.move));
        const rest = ranked.filter((x) => !done.has(x.move)).map((x) => ({ ...x, score: -MATE }));
        ranked = [...scored.sort((x, y) => y.score - x.score), ...rest];
      }
      break;
    }
  }
  let pick = ranked[0] as { move: Move; score: number };
  if (style.slip > 0 && rng.int(100) < style.slip * 100) {
    // Slip to the 2nd/3rd best, but never into a blunder of more than a pawn or so.
    const near = ranked.slice(1, 3).filter((r) => r.score > pick.score - 150);
    if (near.length) pick = near[rng.int(near.length)] as typeof pick;
  }
  return { uci: toUci(pick.move), depth: depthDone, nodes: search.nodes };
}
