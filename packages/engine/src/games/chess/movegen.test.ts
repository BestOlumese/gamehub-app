import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { seededRng } from "../../rng";
import { Board, perft, toUci } from "./movegen";

// Chess Programming Wiki perft results (https://www.chessprogramming.org/Perft_Results).
const PERFT: Array<[string, string, number[]]> = [
  ["start", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [20, 400, 8902, 197281]],
  [
    "kiwipete",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    [48, 2039, 97862],
  ],
  ["position 3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238]],
  [
    "position 4",
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    [6, 264, 9467],
  ],
  ["position 5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379]],
  [
    "position 6",
    "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    [46, 2079, 89890],
  ],
];

describe("bot move generator", () => {
  for (const [name, fen, counts] of PERFT) {
    it(`perft ${name}: ${counts.join(", ")}`, () => {
      const b = Board.fromFen(fen);
      counts.forEach((n, i) => expect(perft(b, i + 1), `depth ${i + 1}`).toBe(n));
    });
  }

  it("matches chess.js move for move over 10 random games", () => {
    // chess.js's detailed move list is slow, so it's compared on every 6th position; move
    // counts (its fast SAN list) are compared on every position.
    const rng = seededRng("movegen");
    for (let g = 0; g < 10; g++) {
      const ref = new Chess();
      for (let ply = 0; ply < 100 && !ref.isGameOver(); ply++) {
        const ours = Board.fromFen(ref.fen()).moves().map(toUci).sort();
        const san = ref.moves();
        if (ours.length !== san.length)
          throw new Error(`${ref.fen()}: ${ours.length} v ${san.length}`);
        if (ply % 6 === 0) {
          const theirs = ref
            .moves({ verbose: true })
            .map((m) => m.lan)
            .sort();
          if (ours.join() !== theirs.join())
            throw new Error(`${ref.fen()}\nours   ${ours.join(" ")}\ntheirs ${theirs.join(" ")}`);
        }
        ref.move(san[rng.int(san.length)] as string);
      }
    }
  }, 120_000);
});
