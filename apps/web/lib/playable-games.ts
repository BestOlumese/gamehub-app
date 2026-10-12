import {
  footballNaija,
  footballRulesSchema,
  chess,
  draughts,
  ludo,
  plots,
  rps,
  snakes,
  tictactoe,
  whot,
  type GameSlug,
} from "@gamehub/engine";

/**
 * Football Draft's full engine needs the player data, which only the realtime Worker loads; the
 * web only needs its rules and seat range to make a room.
 */
const football = {
  ruleSchema: footballRulesSchema,
  presets: { naija: footballNaija },
  minPlayers: 1,
  maxPlayers: 8,
} as const;

/** Games with an engine and a table UI. The rest show "Soon" on the home page. */
const playable = { tictactoe, rps, whot, ludo, snakes, chess, draughts, plots, football } as const;

export type PlayableSlug = keyof typeof playable;

export const isPlayable = (slug: GameSlug): slug is PlayableSlug => slug in playable;

export function gameFor(slug: GameSlug) {
  return isPlayable(slug) ? playable[slug] : null;
}
