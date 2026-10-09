import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import {
  captures,
  distinct,
  genRules,
  geometry,
  legalMoves,
  play,
  startBoard,
  type GenRules,
  type Move,
} from "./board";
import { draughtsEnglish, draughtsNaija, type DraughtsRules, type Variant } from "./rules";

const naijaMajority = genRules({ ...draughtsNaija, captureRule: "majority" });
const naijaFree = genRules(draughtsNaija);
const english = genRules(draughtsEnglish);

function perft(b: Int8Array, v: Variant, r: GenRules, sign: number, depth: number): number {
  const moves = distinct(legalMoves(b, geometry(v), r, sign));
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    const c = b.slice();
    play(c, geometry(v), m);
    n += perft(c, v, r, -sign, depth - 1);
  }
  return n;
}

/**
 * A second, deliberately plain generator (coordinates, sets, no tables) to check the fast one
 * against. Same rules as board.ts, written from docs/games/draughts.md.
 */
function naive(b: Int8Array, v: Variant, r: GenRules, sign: number): string[] {
  const size = v === "naija10" ? 10 : 8;
  const sqAt = (row: number, col: number) =>
    row < 0 || row >= size || col < 0 || col >= size || (row + col) % 2 === 0
      ? -1
      : row * (size / 2) + Math.floor(col / 2);
  const rc = (sq: number) => {
    const row = Math.floor(sq / (size / 2));
    return [row, 2 * (sq % (size / 2)) + (row % 2 === 0 ? 1 : 0)] as const;
  };
  const dirs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const;
  const fwd = (dr: number) => (sign > 0 ? dr < 0 : dr > 0);
  const caps: Array<{ key: string; n: number }> = [];
  const quiet: string[] = [];
  for (let from = 0; from < b.length; from++) {
    const p = b[from] as number;
    if (p * sign <= 0) continue;
    const king = Math.abs(p) === 2;
    const flying = king && r.flying;
    const walk = (at: number, taken: Set<number>, path: number[]) => {
      let more = false;
      for (const [dr, dc] of dirs) {
        if (!king && !r.menBack && !fwd(dr)) continue;
        let [row, col] = rc(at);
        // Find the piece to jump.
        let over = -1;
        for (;;) {
          row += dr;
          col += dc;
          const s = sqAt(row, col);
          if (s < 0) break;
          const empty = s === from || (!r.turkish && taken.has(s)) || b[s] === 0;
          if (empty) {
            if (!flying) break;
            continue;
          }
          over = s;
          break;
        }
        if (over < 0 || taken.has(over) || (b[over] as number) * sign >= 0) continue;
        for (;;) {
          row += dr;
          col += dc;
          const land = sqAt(row, col);
          if (land < 0) break;
          const free = land === from || (!r.turkish && taken.has(land)) || b[land] === 0;
          if (!free) break;
          more = true;
          const t = new Set(taken).add(over);
          const crownRow = sign > 0 ? 0 : size - 1;
          if (!king && r.crownStops && rc(land)[0] === crownRow)
            caps.push({ key: `${from}x${[...path, land].join("x")}`, n: t.size });
          else walk(land, t, [...path, land]);
          if (!flying) break;
        }
      }
      if (!more && taken.size) caps.push({ key: `${from}x${path.join("x")}`, n: taken.size });
    };
    walk(from, new Set(), []);
    for (const [dr, dc] of dirs) {
      if (!king && !fwd(dr)) continue;
      let [row, col] = rc(from);
      for (;;) {
        row += dr;
        col += dc;
        const s = sqAt(row, col);
        if (s < 0 || b[s] !== 0) break;
        quiet.push(`${from}-${s}`);
        if (!flying) break;
      }
    }
  }
  const max = Math.max(0, ...caps.map((c) => c.n));
  const allowed = caps.filter((c) => !r.majority || c.n === max).map((c) => c.key);
  return (allowed.length && r.forced ? allowed : [...allowed, ...quiet]).sort();
}

const key = (m: Move) =>
  `${m.from}${m.captured.length ? "x" : "-"}${m.path.join(m.captured.length ? "x" : "-")}`;

describe("draughts move generator", () => {
  // International draughts perft (FMJD rules: majority capture), from the start position.
  // Published counts, e.g. https://damforum.nl and the Scan/Kingsrow perft tables.
  it("naija10 with majority capture matches the international perft: 9, 81, 658, 4265, 27117", () => {
    const counts = [9, 81, 658, 4265, 27117];
    counts.forEach((n, i) =>
      expect(
        perft(startBoard("naija10"), "naija10", naijaMajority, 1, i + 1),
        `depth ${i + 1}`,
      ).toBe(n),
    );
  });

  it("english8 matches the checkers perft (dark first): 7, 49, 302, 1469, 7361, 36768", () => {
    const counts = [7, 49, 302, 1469, 7361, 36768];
    counts.forEach((n, i) =>
      expect(perft(startBoard("english8"), "english8", english, -1, i + 1), `depth ${i + 1}`).toBe(
        n,
      ),
    );
  });

  const variants: Array<[string, Variant, GenRules]> = [
    ["naija10 free", "naija10", naijaFree],
    ["naija10 majority", "naija10", naijaMajority],
    [
      "naija10 men forward-only, short kings",
      "naija10",
      { ...naijaFree, menBack: false, flying: false },
    ],
    ["naija10 huffing", "naija10", { ...naijaFree, forced: false }],
    ["english8", "english8", english],
  ];
  for (const [name, v, r] of variants)
    it(`${name}: matches a plain second generator over 40 random games`, () => {
      const rng = seededRng(`naive-${name}`);
      const g = geometry(v);
      for (let game = 0; game < 40; game++) {
        const b = startBoard(v);
        let sign = v === "english8" ? -1 : 1;
        for (let ply = 0; ply < 200; ply++) {
          const ours = legalMoves(b, g, r, sign).map(key).sort();
          const theirs = naive(b, v, r, sign);
          if (ours.join() !== theirs.join())
            throw new Error(
              `ply ${ply} ${Array.from(b).join(",")}\nours   ${ours}\ntheirs ${theirs}`,
            );
          if (!ours.length) break;
          // Captures more often than not, so games reach kings and long sequences.
          const moves = legalMoves(b, g, r, sign);
          play(b, g, moves[rng.int(moves.length)] as Move);
          sign = -sign;
        }
      }
    });
});

/** 1-based square at a row and column (0 = top, standard layout). */
function sq(v: Variant, row: number, col: number): number {
  const g = geometry(v);
  for (let i = 0; i < g.squares; i++) if (g.row[i] === row && g.col[i] === col) return i + 1;
  throw new Error(`(${row},${col}) is not a dark square`);
}
/** A board from pieces: [row, col, value] with value ±1 man, ±2 king (+ light). */
function board(v: Variant, pieces: Array<[number, number, number]>): Int8Array {
  const b = new Int8Array(geometry(v).squares);
  for (const [row, col, val] of pieces) b[sq(v, row, col) - 1] = val;
  return b;
}
const legal = (v: Variant, b: Int8Array, rules: DraughtsRules, sign = 1) =>
  legalMoves(b, geometry(v), genRules(rules), sign);
const landing = (m: Move) => m.path[m.path.length - 1] as number;
const N = "naija10" as const;

describe("draughts capture rules", () => {
  it("men capture backward in naija10, and not when the option is off", () => {
    const b = board(N, [
      [5, 4, 1],
      [6, 5, -1],
      [9, 0, -1],
    ]);
    const on = legal(N, b, draughtsNaija);
    expect(on.map((m) => [m.from + 1, landing(m) + 1])).toEqual([[sq(N, 5, 4), sq(N, 7, 6)]]);
    const off = legal(N, b, { ...draughtsNaija, menCaptureBackward: false });
    expect(off.every((m) => m.captured.length === 0)).toBe(true);
  });

  it("a flying king takes from a distance and may land on any empty square beyond", () => {
    const b = board(N, [
      [9, 0, 2],
      [6, 3, -1],
      [0, 1, -1],
    ]);
    const caps = legal(N, b, draughtsNaija);
    expect(caps.map((m) => landing(m) + 1).sort((a, z) => a - z)).toEqual(
      [
        [5, 4],
        [4, 5],
        [3, 6],
        [2, 7],
        [1, 8],
        [0, 9],
      ]
        .map(([r, c]) => sq(N, r as number, c as number))
        .sort((a, z) => a - z),
    );
    expect(caps.every((m) => m.captured.length === 1)).toBe(true);
    // Short kings: only the square straight after, and only if the seed is next to them.
    expect(
      legal(N, b, { ...draughtsNaija, flyingKings: false }).every((m) => !m.captured.length),
    ).toBe(true);
  });

  it("majority: the king's longer capture beats a man's 2-capture; free choice offers both", () => {
    const b = board(N, [
      // Man at (8,1): takes (7,2) and (5,4), two seeds.
      [8, 1, 1],
      [7, 2, -1],
      [5, 4, -1],
      // King at (9,8): three or more seeds in a zig-zag.
      [9, 8, 2],
      [8, 7, -1],
      [6, 7, -1],
      [4, 7, -1],
    ]);
    const man = sq(N, 8, 1) - 1;
    const free = legal(N, b, draughtsNaija);
    const best = Math.max(...free.map((m) => m.captured.length));
    expect(best).toBeGreaterThanOrEqual(3);
    expect(free.some((m) => m.from === man && m.captured.length === 2)).toBe(true);
    const majority = legal(N, b, { ...draughtsNaija, captureRule: "majority" });
    expect(majority.length).toBeGreaterThan(0);
    expect(majority.every((m) => m.captured.length === best && m.from !== man)).toBe(true);
  });

  it("Turkish strike: a taken seed stays until the end, blocks, and can't be taken twice", () => {
    // A king going round a diamond of four seeds can't fly on through the first one it took
    // (still on the board) to a fifth; if seeds went as they were jumped, it could.
    const b = board(N, [
      [6, 3, 2],
      [5, 4, -1],
      [3, 4, -1],
      [3, 2, -1],
      [5, 2, -1],
      [1, 8, -1],
    ]);
    const turkish = captures(b, geometry(N), naijaFree, 1);
    const removedAsJumped = captures(b, geometry(N), { ...naijaFree, turkish: false }, 1);
    for (const m of turkish) expect(new Set(m.captured).size).toBe(m.captured.length);
    expect(Math.max(...turkish.map((m) => m.captured.length))).toBe(4);
    expect(Math.max(...removedAsJumped.map((m) => m.captured.length))).toBe(5);
  });

  it("naija10: a man passing the far row mid-capture is not crowned", () => {
    const b = board(N, [
      [2, 3, 1],
      [1, 4, -1],
      [1, 6, -1],
      [9, 0, -1],
    ]);
    const [m] = legal(N, b, draughtsNaija);
    expect(m && [landing(m) + 1, m.captured.length]).toEqual([sq(N, 2, 7), 2]);
    const crowned = play(b, geometry(N), m as Move);
    expect(crowned).toBe(false);
    expect(b[sq(N, 2, 7) - 1]).toBe(1);
  });

  it("naija10: a man that ends a capture on the far row is crowned", () => {
    const b = board(N, [
      [2, 3, 1],
      [1, 4, -1],
      [9, 0, -1],
    ]);
    const [m] = legal(N, b, draughtsNaija);
    expect(play(b, geometry(N), m as Move)).toBe(true);
    expect(b[sq(N, 0, 5) - 1]).toBe(2);
  });

  it("english8: a man that jumps into the king row is crowned and the move ends", () => {
    const E = "english8" as const;
    const b = board(E, [
      [2, 3, 1],
      [1, 4, -1],
      [1, 6, -1],
      [7, 0, -1],
    ]);
    const moves = legal(E, b, draughtsEnglish);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.path.map((x) => x + 1)).toEqual([sq(E, 0, 5)]);
    expect(play(b, geometry(E), moves[0] as Move)).toBe(true);
  });

  it("english8: men capture forward only; kings move and capture one square", () => {
    const E = "english8" as const;
    const b = board(E, [
      [4, 3, 1],
      [5, 4, -1],
      [7, 0, 2],
      [5, 2, -1],
    ]);
    // The man can't take the seed behind it, and the king's seed isn't next to it: no captures.
    const moves = legal(E, b, draughtsEnglish);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => !m.captured.length)).toBe(true);
    const kings = legal(
      E,
      board(E, [
        [7, 0, 2],
        [6, 1, -1],
        [0, 1, -1],
      ]),
      draughtsEnglish,
    );
    expect(kings.map((m) => landing(m) + 1)).toEqual([sq(E, 5, 2)]);
  });

  it("capture is compulsory; with huffing, quiet moves are allowed too", () => {
    const b = board(N, [
      [6, 3, 1],
      [5, 4, -1],
      [9, 8, 1],
    ]);
    expect(legal(N, b, draughtsNaija).every((m) => m.captured.length)).toBe(true);
    const huff = legal(N, b, { ...draughtsNaija, missedCapture: "huff" });
    expect(huff.some((m) => m.captured.length)).toBe(true);
    expect(huff.some((m) => !m.captured.length)).toBe(true);
  });
});
