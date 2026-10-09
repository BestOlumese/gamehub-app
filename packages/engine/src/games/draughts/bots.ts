// Draughts bots (ours, MIT). Easy and Medium play in the room itself; Hard runs in the bot service
// (docs/15-bot-service.md) with a time limit, and falls back to Medium here.
// Budgets count positions, not time: Date.now() doesn't move during CPU work in a Worker.
import type { Rng } from "../../types";
import {
  captures,
  distinct,
  hasCapture,
  type Geometry,
  type GenRules,
  type Move,
  play,
  quietMoves,
} from "./board";

const WIN = 100_000;
/** Captures searched past the horizon (captures are compulsory, so a position mid-exchange isn't judged). */
const Q_DEPTH = 6;

export type BotStyle = {
  /** Positions the search may look at. */
  budget: number;
  maxDepth: number;
  /** Chance of playing the 2nd or 3rd best move instead of the best. */
  slip: number;
  /** Material only, or material plus position (advancement, back row, centre). */
  positional: boolean;
};

// Budgets fit the Workers Free CPU limit (10 ms per invocation) with room for the move itself:
// measured in Node at ~1.5–3 µs a position on 10×10, p95 about 1 ms (Easy) and 5 ms (Medium).
/** Easy: two moves ahead, material only, slips one move in four. */
export const EASY: BotStyle = { budget: 1000, maxDepth: 2, slip: 0.25, positional: false };
/** Medium: up to four moves ahead plus captures, positional eval, never slips. */
export const MEDIUM: BotStyle = { budget: 3000, maxDepth: 4, slip: 0, positional: true };
/** Hard (bot service): as deep as its time allows. */
export const HARD: BotStyle = { budget: 5_000_000, maxDepth: 30, slip: 0, positional: true };

/** Plays `m` on `b` in place; returns what `unmake` needs to put it back. */
function make(b: Int8Array, g: Geometry, m: Move): { piece: number; taken: number[] } {
  const piece = b[m.from] as number;
  const taken = m.captured.length ? m.captured.map((c) => b[c] as number) : NONE;
  play(b, g, m);
  return { piece, taken };
}
function unmake(b: Int8Array, m: Move, u: { piece: number; taken: number[] }) {
  b[m.path[m.path.length - 1] as number] = 0;
  b[m.from] = u.piece;
  for (let i = 0; i < m.captured.length; i++) b[m.captured[i] as number] = u.taken[i] as number;
}
const NONE: number[] = [];

/**
 * Positional bonus for a light man on each square (dark reads the square turned round):
 * advancement (more in the endgame), a back-row guard against kings, the centre, not the edges.
 */
const POSITIONAL = new Map<Geometry, { early: Int16Array; late: Int16Array }>();
function positional(g: Geometry) {
  let t = POSITIONAL.get(g);
  if (t) return t;
  const last = g.size - 1;
  t = { early: new Int16Array(g.squares), late: new Int16Array(g.squares) };
  for (let sq = 0; sq < g.squares; sq++) {
    const advanced = last - (g.row[sq] as number);
    const col = g.col[sq] as number;
    let common = 0;
    if (col >= 2 && col <= last - 2 && advanced > 2 && advanced < last - 1) common += 6;
    if (col === 0 || col === last) common -= 4;
    t.early[sq] = advanced * 3 + common + (advanced === 0 ? 12 : 0);
    t.late[sq] = advanced * 6 + common;
  }
  POSITIONAL.set(g, t);
  return t;
}

/** Thrown when the budget runs out; one shared value (an Error would build a stack trace). */
const OUT_OF_NODES = Symbol("out of nodes");

class Search {
  nodes = 0;
  private readonly king: number;
  constructor(
    private readonly g: Geometry,
    private readonly r: GenRules,
    private readonly style: BotStyle,
    private readonly stop?: () => boolean,
  ) {
    this.king = r.flying ? 300 : 160;
  }

  private tick() {
    if (++this.nodes > this.style.budget) throw OUT_OF_NODES;
    if (this.stop && (this.nodes & 255) === 0 && this.stop()) throw OUT_OF_NODES;
  }

  /** Score for `sign` (the side to move). */
  evaluate(b: Int8Array, sign: number): number {
    const { g } = this;
    const pos = this.style.positional ? positional(g) : null;
    let score = 0;
    let early = 0;
    let late = 0;
    let pieces = 0;
    for (let sq = 0; sq < g.squares; sq++) {
      const v = b[sq] as number;
      if (v === 0) continue;
      pieces++;
      if (v === 1) {
        score += 100;
        if (pos) {
          early += pos.early[sq] as number;
          late += pos.late[sq] as number;
        }
      } else if (v === -1) {
        score -= 100;
        if (pos) {
          early -= pos.early[g.squares - 1 - sq] as number;
          late -= pos.late[g.squares - 1 - sq] as number;
        }
      } else score += v > 0 ? this.king : -this.king;
    }
    return (score + (pieces < 16 ? late : early)) * sign;
  }

  private moves(b: Int8Array, sign: number): { moves: Move[]; capturing: boolean } {
    // Bots always capture, even when the huffing option allows them not to.
    if (hasCapture(b, this.g, this.r, sign))
      return { moves: distinct(captures(b, this.g, this.r, sign)), capturing: true };
    return { moves: quietMoves(b, this.g, this.r, sign), capturing: false };
  }

  negamax(
    b: Int8Array,
    sign: number,
    depth: number,
    alpha: number,
    beta: number,
    height: number,
    qd: number,
  ): number {
    this.tick();
    const { moves, capturing } = this.moves(b, sign);
    if (!moves.length) return -WIN + height; // no pieces or no moves: lost
    if (depth <= 0 && (!capturing || qd >= Q_DEPTH)) return this.evaluate(b, sign);
    if (capturing) moves.sort((x, y) => y.captured.length - x.captured.length);
    const nextQd = depth <= 0 ? qd + 1 : qd;
    for (const m of moves) {
      const undo = make(b, this.g, m);
      let score: number;
      try {
        score = -this.negamax(b, -sign, depth - 1, -beta, -alpha, height + 1, nextQd);
      } finally {
        unmake(b, m, undo);
      }
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /** Scores root moves at `depth` (full window), pushing each into `out` as it's done. */
  scoreRoot(
    b: Int8Array,
    sign: number,
    moves: Move[],
    depth: number,
    out: Array<{ move: Move; score: number }>,
  ) {
    for (const move of moves) {
      const undo = make(b, this.g, move);
      try {
        out.push({ move, score: -this.negamax(b, -sign, depth - 1, -WIN - 1, WIN + 1, 1, 0) });
      } finally {
        unmake(b, move, undo);
      }
    }
  }

  root(b: Int8Array, sign: number) {
    return this.moves(b, sign).moves;
  }
}

/**
 * The bot's move for `sign` on board `b` (0-based squares), or null if it has none. `stop`
 * (bot service only) ends the search early when time is up; the deepest finished depth counts.
 */
export function searchMove(
  b: Int8Array,
  g: Geometry,
  r: GenRules,
  sign: number,
  style: BotStyle,
  rng: Rng,
  stop?: () => boolean,
): { move: Move | null; depth: number; nodes: number } {
  const search = new Search(g, r, style, stop);
  // Shuffled first, so equal moves are picked at random (the sorts below are stable).
  const moves = rng.shuffle(search.root(b, sign));
  if (!moves.length) return { move: null, depth: 0, nodes: 0 };
  if (moves.length === 1) return { move: moves[0] as Move, depth: 0, nodes: 0 };
  moves.sort((x, y) => y.captured.length - x.captured.length);
  let ranked = moves.map((move) => ({ move, score: 0 }));
  let depthDone = 0;
  for (let depth = 1; depth <= style.maxDepth; depth++) {
    const scored: Array<{ move: Move; score: number }> = [];
    try {
      search.scoreRoot(
        b,
        sign,
        ranked.map((x) => x.move),
        depth,
        scored,
      );
      ranked = scored.sort((x, y) => y.score - x.score);
      depthDone = depth;
      if (Math.abs(ranked[0]?.score ?? 0) > WIN / 2) break; // a forced win or loss is found
    } catch (e) {
      if (e !== OUT_OF_NODES) throw e;
      if (depth === 1 && scored.length) {
        const done = new Set(scored.map((x) => x.move));
        const rest = ranked.filter((x) => !done.has(x.move)).map((x) => ({ ...x, score: -WIN }));
        ranked = [...scored.sort((x, y) => y.score - x.score), ...rest];
      }
      break;
    }
  }
  let pick = ranked[0] as { move: Move; score: number };
  if (style.slip > 0 && rng.int(100) < style.slip * 100) {
    // Slip to the 2nd/3rd best, but never into giving away more than a seed or so.
    const near = ranked.slice(1, 3).filter((x) => x.score > pick.score - 120);
    if (near.length) pick = near[rng.int(near.length)] as typeof pick;
  }
  return { move: pick.move, depth: depthDone, nodes: search.nodes };
}
