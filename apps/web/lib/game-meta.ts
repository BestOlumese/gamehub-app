// Client-safe game names and rule summaries (no zod: imports the light engine entries).
import type { GameSlug } from "@gamehub/engine";
import type { RpsRules } from "@gamehub/engine/rps";
import type { TttRules } from "@gamehub/engine/tictactoe";

export const GAME_NAMES: Record<GameSlug, string> = {
  whot: "Whot",
  ludo: "Ludo",
  snakes: "Snakes & Ladders",
  tictactoe: "Tic-tac-toe",
  rps: "Rock Paper Scissors",
};

export const describeTttRules = (r: TttRules) =>
  `Best of ${r.bestOf} · ${r.turnSeconds} s turns · ${r.alternateStarter ? "starter swaps each round" : "same starter every round"}`;

export const describeRpsRules = (r: RpsRules) =>
  `${r.bestOf === 1 ? "One throw" : `Best of ${r.bestOf}`} per match · ${r.turnSeconds} s to throw`;

export function describeRules(game: GameSlug, rules: unknown): string {
  if (game === "tictactoe") return describeTttRules(rules as TttRules);
  if (game === "rps") return describeRpsRules(rules as RpsRules);
  return "";
}
