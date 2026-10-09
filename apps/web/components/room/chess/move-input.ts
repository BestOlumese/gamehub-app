import { Chess } from "@gamehub/engine/chess";

/**
 * A typed move ("e4", "Nf3", "exd5", "O-O", "e7e8q", "e2e4") as from/to/promotion, if it's
 * legal in this position. SAN is read leniently (case, missing "x" or "+").
 */
export function parseTypedMove(
  fen: string,
  text: string,
): { from: string; to: string; promotion?: string } | null {
  const t = text.trim().replace(/0/g, "O");
  if (!t) return null;
  const c = new Chess(fen);
  const uci = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(t);
  try {
    const m = uci
      ? c.move({
          from: (uci[1] ?? "").toLowerCase(),
          to: (uci[2] ?? "").toLowerCase(),
          promotion: uci[3]?.toLowerCase(),
        })
      : c.move(t, { strict: false });
    return m.promotion
      ? { from: m.from, to: m.to, promotion: m.promotion }
      : { from: m.from, to: m.to };
  } catch {
    return null;
  }
}
