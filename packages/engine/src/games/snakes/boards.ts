// Our own boards (not the 1943 Milton Bradley layout). Each was tuned by simulation:
// 10,000 four-player games, median length 25–60 rounds (see docs/games/snakes-and-ladders.md).

export type BoardId = "naija-classic" | "quick" | "lagos-traffic" | "balanced";

export type Board = {
  id: BoardId;
  name: string;
  blurb: string;
  /** bottom → top */
  ladders: Readonly<Record<number, number>>;
  /** head → tail */
  snakes: Readonly<Record<number, number>>;
};

export const BOARDS: Readonly<Record<BoardId, Board>> = {
  "naija-classic": {
    id: "naija-classic",
    name: "Naija Classic",
    blurb: "The traditional feel: 9 ladders, 9 snakes.",
    ladders: { 3: 22, 8: 30, 17: 44, 26: 47, 33: 52, 49: 71, 58: 77, 69: 88, 78: 96 },
    snakes: { 19: 6, 31: 12, 46: 25, 54: 34, 63: 45, 84: 64, 91: 70, 94: 75, 98: 79 },
  },
  quick: {
    id: "quick",
    name: "Quick",
    blurb: "More ladders, shorter games.",
    ladders: { 2: 18, 6: 27, 15: 38, 24: 51, 36: 62, 42: 65, 53: 79, 60: 84, 71: 93 },
    snakes: { 29: 11, 44: 16, 47: 30, 58: 39, 68: 52, 77: 55, 86: 66, 95: 72 },
  },
  "lagos-traffic": {
    id: "lagos-traffic",
    name: "Lagos Traffic",
    blurb: "Long snakes near the top. You can be almost home and go right back.",
    ladders: { 4: 25, 13: 46, 21: 42, 33: 57, 50: 68, 62: 81, 70: 87, 74: 92, 79: 98 },
    snakes: { 27: 9, 56: 35, 85: 64, 89: 53, 93: 16, 97: 61, 99: 58 },
  },
  balanced: {
    id: "balanced",
    name: "Balanced",
    blurb: "Ladders and snakes cancel out: even risk all the way.",
    ladders: { 5: 26, 12: 31, 28: 50, 40: 59, 52: 73, 66: 85, 77: 94 },
    snakes: { 23: 4, 37: 18, 48: 29, 61: 42, 75: 56, 88: 69, 96: 78 },
  },
};

export const BOARD_IDS = Object.keys(BOARDS) as BoardId[];

/** Where a token ends up after landing on `square` (ladder or snake), or the square itself. */
export function resolve(board: Board, square: number): number {
  return board.ladders[square] ?? board.snakes[square] ?? square;
}
