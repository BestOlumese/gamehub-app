import { speedOf, type ChessRules } from "@gamehub/engine/chess";

/** "5 min + 3 s a move · Blitz", "10 min each · Rapid", "No clock · 5 min a move". */
export function timeControlText(r: ChessRules): string {
  const tc = r.timeControl;
  if (!tc) return `No clock · ${r.moveLimitSeconds / 60} min a move`;
  const speed = speedOf(tc);
  const label = speed ? `${speed.charAt(0).toUpperCase()}${speed.slice(1)}` : "";
  const base = tc.baseSeconds / 60;
  return tc.incrementSeconds
    ? `${base} min + ${tc.incrementSeconds} s a move · ${label}`
    : `${base} min each · ${label}`;
}
