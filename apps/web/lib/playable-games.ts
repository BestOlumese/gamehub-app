import {
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

/** Games with an engine and a table UI. The rest show "Soon" on the home page. */
const playable = { tictactoe, rps, whot, ludo, snakes, chess, draughts, plots } as const;

export type PlayableSlug = keyof typeof playable;

export const isPlayable = (slug: GameSlug): slug is PlayableSlug => slug in playable;

export function gameFor(slug: GameSlug) {
  return isPlayable(slug) ? playable[slug] : null;
}
