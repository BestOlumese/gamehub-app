import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnkaraTile } from "./ankara-tile";
import { EnvelopeArt } from "./envelope-art";
import { GameLudoArt } from "./game-ludo-art";
import { GameRpsArt } from "./game-rps-art";
import { GameSnakesArt } from "./game-snakes-art";
import { GameTicTacToeArt } from "./game-tictactoe-art";
import { GameWhotArt } from "./game-whot-art";
import { HeroTableArt } from "./hero-table-art";

/**
 * Decorative art served as static files (apps/web/public/art) instead of inline
 * markup, so it's cached once and kept out of every page's HTML and RSC payload.
 * Regenerate with `pnpm --filter @gamehub/ui art`.
 */
const files: Record<string, ReactElement> = {
  "hero-table.svg": <HeroTableArt />,
  "envelope.svg": <EnvelopeArt />,
  "game-whot.svg": <GameWhotArt />,
  "game-ludo.svg": <GameLudoArt />,
  "game-snakes.svg": <GameSnakesArt />,
  "game-tictactoe.svg": <GameTicTacToeArt />,
  "game-rps.svg": <GameRpsArt />,
  "ankara-paper.svg": <AnkaraTile tone="paper" />,
  "ankara-brand.svg": <AnkaraTile tone="brand" />,
};

export function staticArt(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([name, el]) => [
      name,
      renderToStaticMarkup(el)
        .replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
        .replace(/ aria-hidden="true"/, "") + "\n",
    ]),
  );
}
