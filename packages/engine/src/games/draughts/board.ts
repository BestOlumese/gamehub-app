// Draughts board geometry and move generation (ours, MIT). Pure and browser-safe: the client
// uses it for legal-move dots, the room to referee, the bots to search.
//
// Squares are numbered 1–50 (10×10) or 1–32 (8×8) row by row from the top player's side, as in
// standard notation. Internally a board is an Int8Array indexed by square - 1:
// 0 empty, ±1 man, ±2 king; + is light (starts at the bottom, moves up), - is dark.
import type { DraughtsRules, Variant } from "./rules";

export const EMPTY = 0;
/** A piece taken earlier in this capture: it stays on the board (Turkish strike) but can't be jumped again. */
const TAKEN = 100;

/** Directions: up-left, up-right, down-left, down-right (up = towards square 1). */
const DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

export type Geometry = {
  size: 8 | 10;
  squares: number;
  /** Row and column of each square (0-based index), standard layout: the bottom-left corner is dark. */
  row: Int8Array;
  col: Int8Array;
  /** rays[index * 4 + dir]: the squares along that diagonal, nearest first. */
  rays: Int8Array[];
};

function build(size: 8 | 10): Geometry {
  const half = size / 2;
  const squares = size * half;
  const row = new Int8Array(squares);
  const col = new Int8Array(squares);
  const at = new Map<number, number>();
  for (let i = 0; i < squares; i++) {
    const r = Math.floor(i / half);
    const c = 2 * (i % half) + (r % 2 === 0 ? 1 : 0);
    row[i] = r;
    col[i] = c;
    at.set(r * size + c, i);
  }
  const rays: Int8Array[] = [];
  for (let i = 0; i < squares; i++)
    for (const [dr, dc] of DIRS) {
      const ray: number[] = [];
      let r = (row[i] as number) + dr;
      let c = (col[i] as number) + dc;
      while (r >= 0 && r < size && c >= 0 && c < size) {
        ray.push(at.get(r * size + c) as number);
        r += dr;
        c += dc;
      }
      rays.push(Int8Array.from(ray));
    }
  return { size, squares, row, col, rays };
}

const GEOMETRY = { naija10: build(10), english8: build(8) } as const;
export const geometry = (v: Variant): Geometry => GEOMETRY[v];

/** Move generation settings, from the rules (variant-fixed fields already applied). */
export type GenRules = {
  menBack: boolean;
  flying: boolean;
  majority: boolean;
  /** Turkish strike: taken pieces stay until the capture ends (naija10). Otherwise they go as they're jumped. */
  turkish: boolean;
  /** english8: a man that reaches the far row mid-capture is crowned and the move ends. */
  crownStops: boolean;
  /** Captures are compulsory (false: the huffing option, where any move is allowed). */
  forced: boolean;
};

export function genRules(r: DraughtsRules): GenRules {
  const english = r.variant === "english8";
  return {
    menBack: english ? false : r.menCaptureBackward,
    flying: english ? false : r.flyingKings,
    majority: english ? false : r.captureRule === "majority",
    turkish: !english,
    crownStops: english,
    forced: r.missedCapture === "forced",
  };
}

/** A move, 0-based: `path` is every landing square (one entry for a simple move). */
export type Move = { from: number; path: number[]; captured: number[] };

/** Is `dir` forward for this side? Light moves up (dirs 0, 1), dark down (2, 3). */
const forward = (dir: number, sign: number) => (sign > 0 ? dir < 2 : dir >= 2);

export const crownRow = (g: Geometry, sign: number) => (sign > 0 ? 0 : g.size - 1);
export const isCrowning = (g: Geometry, sq: number, sign: number) =>
  g.row[sq] === crownRow(g, sign);

/** Every complete capture sequence for `sign` (before the majority filter). */
function allCaptures(b: Int8Array, g: Geometry, r: GenRules, sign: number): Move[] {
  const out: Move[] = [];
  const path: number[] = [];
  const taken: number[] = [];

  const dfs = (from: number, at: number, king: boolean) => {
    let extended = false;
    for (let d = 0; d < 4; d++) {
      if (!king && !r.menBack && !forward(d, sign)) continue;
      const ray = g.rays[at * 4 + d] as Int8Array;
      let i = 0;
      if (king && r.flying) while (i < ray.length && b[ray[i] as number] === EMPTY) i++;
      if (i >= ray.length - 1) continue;
      const over = ray[i] as number;
      const v = b[over] as number;
      if (v === TAKEN || v * sign >= 0) continue; // own piece, or one already taken: blocked
      const firstLanding = i + 1;
      if (b[ray[firstLanding] as number] !== EMPTY) continue;
      const last = king && r.flying ? ray.length : firstLanding + 1;
      b[over] = r.turkish ? TAKEN : EMPTY;
      taken.push(over);
      for (let j = firstLanding; j < last; j++) {
        const land = ray[j] as number;
        if (b[land] !== EMPTY) break;
        extended = true;
        path.push(land);
        if (!king && r.crownStops && isCrowning(g, land, sign))
          out.push({ from, path: [...path], captured: [...taken] });
        else dfs(from, land, king);
        path.pop();
      }
      taken.pop();
      b[over] = v;
    }
    if (!extended && taken.length) out.push({ from, path: [...path], captured: [...taken] });
  };

  for (let sq = 0; sq < g.squares; sq++) {
    const v = b[sq] as number;
    if (v * sign <= 0) continue;
    b[sq] = EMPTY; // the moving piece has left its square: it can pass over it again
    dfs(sq, sq, v === 2 || v === -2);
    b[sq] = v;
  }
  return out;
}

/** Is there any capture for `sign`? Much cheaper than listing them (most positions have none). */
export function hasCapture(b: Int8Array, g: Geometry, r: GenRules, sign: number): boolean {
  for (let sq = 0; sq < g.squares; sq++) {
    const v = b[sq] as number;
    if (v * sign <= 0) continue;
    const king = v === 2 || v === -2;
    for (let d = 0; d < 4; d++) {
      if (!king && !r.menBack && !forward(d, sign)) continue;
      const ray = g.rays[sq * 4 + d] as Int8Array;
      let i = 0;
      if (king && r.flying) while (i < ray.length && b[ray[i] as number] === EMPTY) i++;
      if (i >= ray.length - 1) continue;
      if ((b[ray[i] as number] as number) * sign < 0 && b[ray[i + 1] as number] === EMPTY)
        return true;
    }
  }
  return false;
}

/** Captures the side may play: all of them, or (majority rule) only the longest. */
export function captures(b: Int8Array, g: Geometry, r: GenRules, sign: number): Move[] {
  if (!hasCapture(b, g, r, sign)) return [];
  const all = allCaptures(b, g, r, sign);
  if (!r.majority || all.length < 2) return all;
  let best = 0;
  for (const m of all) best = Math.max(best, m.captured.length);
  return all.filter((m) => m.captured.length === best);
}

/** Non-capturing moves. */
export function quietMoves(b: Int8Array, g: Geometry, r: GenRules, sign: number): Move[] {
  const out: Move[] = [];
  for (let sq = 0; sq < g.squares; sq++) {
    const v = b[sq] as number;
    if (v * sign <= 0) continue;
    const king = v === 2 || v === -2;
    for (let d = 0; d < 4; d++) {
      if (!king && !forward(d, sign)) continue;
      const ray = g.rays[sq * 4 + d] as Int8Array;
      const reach = king && r.flying ? ray.length : Math.min(1, ray.length);
      for (let i = 0; i < reach; i++) {
        const to = ray[i] as number;
        if (b[to] !== EMPTY) break;
        out.push({ from: sq, path: [to], captured: [] });
      }
    }
  }
  return out;
}

/** Every legal move: captures when there are any (compulsory), else quiet moves; both with huffing. */
export function legalMoves(b: Int8Array, g: Geometry, r: GenRules, sign: number): Move[] {
  const caps = captures(b, g, r, sign);
  if (caps.length && r.forced) return caps;
  return caps.length ? [...caps, ...quietMoves(b, g, r, sign)] : quietMoves(b, g, r, sign);
}

/** Plays a move on `b` in place; returns whether the piece was crowned. */
export function play(b: Int8Array, g: Geometry, m: Move): boolean {
  const v = b[m.from] as number;
  const sign = v > 0 ? 1 : -1;
  const to = m.path[m.path.length - 1] as number;
  b[m.from] = EMPTY;
  for (const c of m.captured) b[c] = EMPTY;
  const crowned = (v === 1 || v === -1) && isCrowning(g, to, sign);
  b[to] = crowned ? 2 * sign : v;
  return crowned;
}

/**
 * One move per distinct outcome: a flying king can often reach the same square, taking the same
 * seeds, by different routes. The first route found stands for the rest.
 */
export function distinct(moves: Move[]): Move[] {
  if (moves.length < 2) return moves;
  const seen = new Set<string>();
  return moves.filter((m) => {
    const key = `${m.from}>${m.path[m.path.length - 1]}:${[...m.captured].sort((a, b) => a - b).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const sameMove = (a: Move, b: Move) =>
  a.from === b.from && a.path.length === b.path.length && a.path.every((x, i) => x === b.path[i]);

/** The starting position: dark on the top rows, light on the bottom, two empty rows between. */
export function startBoard(v: Variant): Int8Array {
  const g = geometry(v);
  const rows = v === "naija10" ? 4 : 3;
  const b = new Int8Array(g.squares);
  for (let i = 0; i < g.squares; i++) {
    const r = g.row[i] as number;
    if (r < rows) b[i] = -1;
    else if (r >= g.size - rows) b[i] = 1;
  }
  return b;
}

/** Standard notation, 1-based: "32-28" for a move, "28x19x10" for a capture (every landing listed). */
export const notation = (m: Move) =>
  [m.from, ...m.path].map((x) => x + 1).join(m.captured.length ? "x" : "-");

const CHARS: Record<number, string> = { 0: ".", 1: "l", 2: "L", [-1]: "d", [-2]: "D" };
const VALUES: Record<string, number> = { ".": 0, l: 1, L: 2, d: -1, D: -2 };

/** A board as text, one character a square ("." empty, l/L light man/king, d/D dark). */
export const encode = (b: ArrayLike<number>) => Array.from(b, (v) => CHARS[v] ?? ".").join("");
export const decode = (s: string) => Int8Array.from(s, (ch) => VALUES[ch] ?? 0);
