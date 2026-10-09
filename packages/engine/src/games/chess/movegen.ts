// Our own small move generator (0x88 board, packed integer moves), used only by the built-in
// bots: chess.js is the referee, but it's far too slow to search with (docs/games/chess.md).
// Checked against chess.js and the standard perft counts in movegen.test.ts.

/** Piece codes: colour bit 8 (black) | type 1–6. */
export const P = 1;
export const N = 2;
export const B = 3;
export const R = 4;
export const Q = 5;
export const K = 6;
export const BLACK = 8;

const FLAG_CAPTURE = 1;
const FLAG_EP = 2;
const FLAG_CASTLE = 4;
const FLAG_DOUBLE = 8;

/** from | to << 7 | promo << 14 | flags << 17 */
export type Move = number;
export const moveFrom = (m: Move) => m & 0x7f;
export const moveTo = (m: Move) => (m >> 7) & 0x7f;
export const movePromo = (m: Move) => (m >> 14) & 0x7;
export const isCapture = (m: Move) => ((m >> 17) & FLAG_CAPTURE) !== 0;
const flagsOf = (m: Move) => m >> 17;
const pack = (from: number, to: number, promo: number, flags: number) =>
  from | (to << 7) | (promo << 14) | (flags << 17);

const KNIGHT = [33, 31, 18, 14, -33, -31, -18, -14];
const KING = [1, -1, 16, -16, 15, 17, -15, -17];
const DIAG = [15, 17, -15, -17];
const ORTHO = [1, -1, 16, -16];
const onBoard = (sq: number) => (sq & 0x88) === 0;

/** Castling right bits; a move from or to these squares clears them. */
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0x04] = 15 & ~3; // e1
CASTLE_MASK[0x00] = 15 & ~2; // a1
CASTLE_MASK[0x07] = 15 & ~1; // h1
CASTLE_MASK[0x74] = 15 & ~12; // e8
CASTLE_MASK[0x70] = 15 & ~8; // a8
CASTLE_MASK[0x77] = 15 & ~4; // h8

type Undo = { move: Move; captured: number; castling: number; ep: number; halfmove: number };

export class Board {
  sq = new Int8Array(128);
  /** 0 = white, 8 = black */
  side = 0;
  castling = 0;
  /** En-passant target square, or -1. */
  ep = -1;
  halfmove = 0;
  /** King squares, [white, black], kept up to date by make/unmake. */
  kings = [-1, -1];
  private undos: Undo[] = [];

  static fromFen(fen: string): Board {
    const b = new Board();
    const [placement = "", side = "w", castle = "-", ep = "-", half = "0"] = fen.split(" ");
    const rows = placement.split("/");
    rows.forEach((row, i) => {
      const rank = 7 - i;
      let file = 0;
      for (const ch of row) {
        if (ch >= "1" && ch <= "8") {
          file += Number(ch);
          continue;
        }
        const type = "pnbrqk".indexOf(ch.toLowerCase()) + 1;
        const black = ch === ch.toLowerCase();
        b.sq[rank * 16 + file] = type | (black ? BLACK : 0);
        if (type === K) b.kings[black ? 1 : 0] = rank * 16 + file;
        file++;
      }
    });
    b.side = side === "b" ? BLACK : 0;
    b.castling =
      (castle.includes("K") ? 1 : 0) |
      (castle.includes("Q") ? 2 : 0) |
      (castle.includes("k") ? 4 : 0) |
      (castle.includes("q") ? 8 : 0);
    b.ep = ep === "-" ? -1 : squareIndex(ep);
    b.halfmove = Number(half) || 0;
    return b;
  }

  /** Is `sq` attacked by `by` (0 white / 8 black)? */
  attacked(sq: number, by: number): boolean {
    const s = this.sq;
    // Pawns: a white pawn attacks up-left/up-right, so look down from the target.
    const pd = by === 0 ? -16 : 16;
    if (onBoard(sq + pd - 1) && s[sq + pd - 1] === (P | by)) return true;
    if (onBoard(sq + pd + 1) && s[sq + pd + 1] === (P | by)) return true;
    for (const d of KNIGHT) {
      const f = sq + d;
      if (onBoard(f) && s[f] === (N | by)) return true;
    }
    for (const d of KING) {
      const f = sq + d;
      if (onBoard(f) && s[f] === (K | by)) return true;
    }
    for (const d of DIAG) {
      for (let f = sq + d; onBoard(f); f += d) {
        const p = s[f] as number;
        if (!p) continue;
        if (p === (B | by) || p === (Q | by)) return true;
        break;
      }
    }
    for (const d of ORTHO) {
      for (let f = sq + d; onBoard(f); f += d) {
        const p = s[f] as number;
        if (!p) continue;
        if (p === (R | by) || p === (Q | by)) return true;
        break;
      }
    }
    return false;
  }

  kingSquare(colour: number): number {
    return this.kings[colour ? 1 : 0] as number;
  }

  /** After make(): did that move leave its own king in check (i.e. it was illegal)? */
  leftKingInCheck(): boolean {
    const mover = this.side ^ BLACK;
    return this.attacked(this.kingSquare(mover), this.side);
  }

  inCheck(colour = this.side): boolean {
    return this.attacked(this.kingSquare(colour), colour ^ BLACK);
  }

  /** Pseudo-legal moves (may leave the king in check): the search checks legality as it goes. */
  pseudo(capturesOnly: boolean): Move[] {
    // Hot path for the bots: no closures or temporary arrays inside the loop.
    const out: Move[] = [];
    const s = this.sq;
    const us = this.side;
    const dir = us === 0 ? 16 : -16;
    const startRank = us === 0 ? 1 : 6;
    const lastRank = us === 0 ? 7 : 0;
    for (let from = 0; from < 128; from++) {
      if (from & 0x88) {
        from += 7;
        continue;
      }
      const p = s[from] as number;
      if (!p || (p & BLACK) !== us) continue;
      const type = p & 7;
      if (type === P) {
        const one = from + dir;
        const promoting = one >> 4 === lastRank;
        if (!capturesOnly && !(one & 0x88) && !s[one]) {
          if (promoting) {
            out.push(
              pack(from, one, Q, 0),
              pack(from, one, R, 0),
              pack(from, one, B, 0),
              pack(from, one, N, 0),
            );
          } else {
            out.push(pack(from, one, 0, 0));
            const two = one + dir;
            if (from >> 4 === startRank && !s[two]) out.push(pack(from, two, 0, FLAG_DOUBLE));
          }
        }
        for (let side = -1; side <= 1; side += 2) {
          const to = one + side;
          if (to & 0x88) continue;
          const t = s[to] as number;
          if (t && (t & BLACK) !== us) {
            if (promoting)
              out.push(
                pack(from, to, Q, FLAG_CAPTURE),
                pack(from, to, R, FLAG_CAPTURE),
                pack(from, to, B, FLAG_CAPTURE),
                pack(from, to, N, FLAG_CAPTURE),
              );
            else out.push(pack(from, to, 0, FLAG_CAPTURE));
          } else if (to === this.ep) out.push(pack(from, to, 0, FLAG_CAPTURE | FLAG_EP));
        }
        continue;
      }
      const steps =
        type === N ? KNIGHT : type === K ? KING : type === B ? DIAG : type === R ? ORTHO : KING;
      const slides = type === B || type === R || type === Q;
      for (let k = 0; k < steps.length; k++) {
        const d = steps[k] as number;
        for (let to = from + d; !(to & 0x88); to += d) {
          const t = s[to] as number;
          if (t) {
            if ((t & BLACK) !== us) out.push(pack(from, to, 0, FLAG_CAPTURE));
            break;
          }
          if (!capturesOnly) out.push(pack(from, to, 0, 0));
          if (!slides) break;
        }
      }
      // Castling: cheap checks (rights, empty squares, rook) before the costly attack checks.
      if (type === K && !capturesOnly && this.castling) {
        const rank = us === 0 ? 0 : 0x70;
        if (from !== rank + 4) continue;
        const them = us ^ BLACK;
        const kSide =
          this.castling & (us === 0 ? 1 : 4) &&
          !s[rank + 5] &&
          !s[rank + 6] &&
          s[rank + 7] === (R | us);
        const qSide =
          this.castling & (us === 0 ? 2 : 8) &&
          !s[rank + 3] &&
          !s[rank + 2] &&
          !s[rank + 1] &&
          s[rank] === (R | us);
        if ((!kSide && !qSide) || this.attacked(from, them)) continue;
        if (kSide && !this.attacked(rank + 5, them) && !this.attacked(rank + 6, them))
          out.push(pack(from, rank + 6, 0, FLAG_CASTLE));
        if (qSide && !this.attacked(rank + 3, them) && !this.attacked(rank + 2, them))
          out.push(pack(from, rank + 2, 0, FLAG_CASTLE));
      }
    }
    return out;
  }

  make(m: Move) {
    const s = this.sq;
    const from = moveFrom(m);
    const to = moveTo(m);
    const flags = flagsOf(m);
    const piece = s[from] as number;
    let captured = s[to] as number;
    this.undos.push({
      move: m,
      captured,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
    });
    s[to] = movePromo(m) ? movePromo(m) | this.side : piece;
    s[from] = 0;
    if ((piece & 7) === K) this.kings[this.side ? 1 : 0] = to;
    if (flags & FLAG_EP) {
      const victim = to + (this.side === 0 ? -16 : 16);
      captured = s[victim] as number;
      s[victim] = 0;
      (this.undos.at(-1) as Undo).captured = captured;
    }
    if (flags & FLAG_CASTLE) {
      const rank = to & 0x70;
      if ((to & 7) === 6) {
        s[rank + 5] = s[rank + 7] as number;
        s[rank + 7] = 0;
      } else {
        s[rank + 3] = s[rank] as number;
        s[rank] = 0;
      }
    }
    this.castling &= (CASTLE_MASK[from] as number) & (CASTLE_MASK[to] as number);
    this.ep = flags & FLAG_DOUBLE ? (from + to) >> 1 : -1;
    this.halfmove = (piece & 7) === P || captured ? 0 : this.halfmove + 1;
    this.side ^= BLACK;
  }

  unmake() {
    const u = this.undos.pop();
    if (!u) return;
    const s = this.sq;
    this.side ^= BLACK;
    const m = u.move;
    const from = moveFrom(m);
    const to = moveTo(m);
    const flags = flagsOf(m);
    s[from] = movePromo(m) ? P | this.side : (s[to] as number);
    if (((s[from] as number) & 7) === K) this.kings[this.side ? 1 : 0] = from;
    if (flags & FLAG_EP) {
      s[to] = 0;
      s[to + (this.side === 0 ? -16 : 16)] = u.captured;
    } else s[to] = u.captured;
    if (flags & FLAG_CASTLE) {
      const rank = to & 0x70;
      if ((to & 7) === 6) {
        s[rank + 7] = s[rank + 5] as number;
        s[rank + 5] = 0;
      } else {
        s[rank] = s[rank + 3] as number;
        s[rank + 3] = 0;
      }
    }
    this.castling = u.castling;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
  }

  /** Legal moves (optionally captures and promotions only, for quiescence). */
  moves(capturesOnly = false): Move[] {
    const us = this.side;
    const legal: Move[] = [];
    for (const m of this.pseudo(capturesOnly)) {
      this.make(m);
      if (!this.attacked(this.kingSquare(us), us ^ BLACK)) legal.push(m);
      this.unmake();
    }
    return legal;
  }
}

export const squareIndex = (name: string) => (Number(name[1]) - 1) * 16 + (name.charCodeAt(0) - 97);
export const squareName = (sq: number) => `${String.fromCharCode(97 + (sq & 7))}${(sq >> 4) + 1}`;

export function toUci(m: Move): string {
  const promo = movePromo(m);
  return `${squareName(moveFrom(m))}${squareName(moveTo(m))}${promo ? " pnbrqk"[promo] : ""}`;
}

/** Leaf-node count to `depth` (the standard move-generator check). */
export function perft(b: Board, depth: number): number {
  if (depth === 0) return 1;
  const moves = b.moves();
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    b.make(m);
    n += perft(b, depth - 1);
    b.unmake();
  }
  return n;
}
