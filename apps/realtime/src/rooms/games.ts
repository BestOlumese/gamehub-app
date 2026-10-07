import {
  ludo,
  rps,
  snakes,
  tictactoe,
  whot,
  type GameDefinition,
  type GameSlug,
  type RuleConfigBase,
} from "@gamehub/engine";

/** A game with its types erased; the room validates everything at the edges with each game's zod schemas. */
export type AnyGame = GameDefinition<unknown, unknown, unknown, RuleConfigBase>;

const registry: Partial<Record<GameSlug, AnyGame>> = {
  tictactoe: tictactoe as unknown as AnyGame,
  rps: rps as unknown as AnyGame,
  whot: whot as unknown as AnyGame,
  ludo: ludo as unknown as AnyGame,
  snakes: snakes as unknown as AnyGame,
};

export function gameFor(slug: GameSlug): AnyGame | null {
  return registry[slug] ?? null;
}
