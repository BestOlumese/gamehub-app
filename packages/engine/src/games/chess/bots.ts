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
const PST: Int16Array[] = [];
for (const t of [P, N, B, R, Q, K]) {
  const table = new Int16Array(128);
  const raw = RAW[t] as number[];
  for (let rank = 0; rank < 8; rank++)
    for (let file = 0; file < 8; file++)
      table[rank * 16 + file] = raw[(7 - rank) * 8 + file] as number;
  PST[t] = table;
}

const MATE = 100_000;

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
    const t = p & 7;
    const black = (p & BLACK) !== 0;
    const v = (VALUE[t] as number) + ((PST[t] as Int16Array)[black ? i ^ 0x70 : i] as number);
    score += black ? -v : v;
  }
  return b.side === 0 ? score : -score;
}

/** Captures first, most valuable victim by least valuable attacker; then promotions. */
function order(b: Board, moves: Move[]): Move[] {
  const key = (m: Move) =>
    (isCapture(m)
      ? 10 * (VALUE[(b.sq[moveTo(m)] as number) & 7] || 100) -
        (VALUE[(b.sq[moveFrom(m)] as number) & 7] as number) / 10
      : 0) + (movePromo(m) ? 800 : 0);
  return moves
    .map((m) => [key(m), m] as const)
    .sort((x, y) => y[0] - x[0])
    .map(([, m]) => m);
}

class OutOfNodes extends Error {}

class Search {
  nodes = 0;
  constructor(private readonly budget: number) {}

  private tick() {
    if (++this.nodes > this.budget) throw new OutOfNodes();
  }

  quiesce(b: Board, alpha: number, beta: number): number {
    this.tick();
    const stand = evaluate(b);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    for (const m of order(b, b.moves(true))) {
      b.make(m);
      const score = -this.quiesce(b, -beta, -alpha);
      b.unmake();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  negamax(b: Board, depth: number, alpha: number, beta: number, height: number): number {
    if (depth === 0) return this.quiesce(b, alpha, beta);
    this.tick();
    const moves = b.moves();
    if (!moves.length) return b.inCheck() ? -MATE + height : 0;
    for (const m of order(b, moves)) {
      b.make(m);
      const score = -this.negamax(b, depth - 1, -beta, -alpha, height + 1);
      b.unmake();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /** Every root move with its score at `depth` (full window, so scores compare fairly). */
  scoreRoot(b: Board, moves: Move[], depth: number): Array<{ move: Move; score: number }> {
    return moves.map((move) => {
      b.make(move);
      try {
        return { move, score: -this.negamax(b, depth - 1, -MATE - 1, MATE + 1, 1) };
      } finally {
        b.unmake();
      }
    });
  }
}

export type BotStyle = {
  /** Positions the search may look at. */
  budget: number;
  maxDepth: number;
  /** Chance of playing the 2nd or 3rd best move instead of the best. */
  slip: number;
};

/** Easy: one move ahead plus captures, 1,500 positions, a slip one move in five. */
export const EASY: BotStyle = { budget: 1500, maxDepth: 1, slip: 0.2 };
/** "Easy+": the fallback when the bot service can't answer. Deeper, never slips. */
export const EASY_PLUS: BotStyle = { budget: 4000, maxDepth: 3, slip: 0 };

/** A move (UCI) for the side to move, or null if there's none. */
export function botMove(fen: string, style: BotStyle, rng: Rng): string | null {
  const b = Board.fromFen(fen);
  const moves = b.moves();
  if (!moves.length) return null;
  if (moves.length === 1) return toUci(moves[0] as Move);
  const search = new Search(style.budget);
  let ranked: Array<{ move: Move; score: number }> = order(b, moves).map((move) => ({
    move,
    score: 0,
  }));
  // Iterative deepening: keep the last depth that finished inside the budget.
  for (let depth = 1; depth <= style.maxDepth; depth++) {
    try {
      ranked = search
        .scoreRoot(
          b,
          ranked.map((r) => r.move),
          depth,
        )
        .sort((x, y) => y.score - x.score);
    } catch (e) {
      if (!(e instanceof OutOfNodes)) throw e;
      break;
    }
  }
  let pick = ranked[0] as { move: Move; score: number };
  if (style.slip > 0 && rng.int(100) < style.slip * 100) {
    // Slip to the 2nd/3rd best, but never into a blunder of more than a pawn or so.
    const near = ranked.slice(1, 3).filter((r) => r.score > pick.score - 150);
    if (near.length) pick = near[rng.int(near.length)] as typeof pick;
  }
  return toUci(pick.move);
}
