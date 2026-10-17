// Rating pools and their names (client-safe).
import type { GameSlug } from "@gamehub/engine";
import { GAME_NAMES } from "@/lib/game-meta";

/** Ranked games and their pools, in the order the leaderboards show them. */
export const POOLS: ReadonlyArray<{ game: GameSlug; variants: readonly string[] }> = [
  { game: "chess", variants: ["blitz", "bullet", "rapid"] },
  { game: "whot", variants: ["standard"] },
  { game: "ludo", variants: ["standard"] },
  { game: "draughts", variants: ["naija10", "english8"] },
  { game: "snakes", variants: ["standard"] },
  { game: "rps", variants: ["standard"] },
  { game: "tictactoe", variants: ["standard"] },
];

const VARIANT_NAMES: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  naija10: "Naija",
  english8: "English",
  solo: "Solo run",
};

export const variantName = (v: string) => VARIANT_NAMES[v] ?? "";

/** "Chess · Blitz", "Whot". */
export const poolName = (game: string, variant: string) =>
  `${GAME_NAMES[game as GameSlug] ?? game}${variant !== "standard" && variantName(variant) ? ` · ${variantName(variant)}` : ""}`;

/** "2h ago", "3 days ago", "today". */
export function ago(d: Date, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - d.getTime()) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
