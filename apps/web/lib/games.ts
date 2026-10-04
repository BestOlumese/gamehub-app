import type { GameSlug } from "@gamehub/engine";

export type GameInfo = {
  slug: GameSlug;
  name: string;
  players: string;
  blurb: string;
  /** Piece colours shown on the landing card. */
  swatch: readonly string[];
};

export const games: readonly GameInfo[] = [
  {
    slug: "whot",
    name: "Whot",
    players: "2–8 players",
    blurb: "Pick 2, Hold on, General market. First to empty their hand wins.",
    swatch: ["bg-whot", "bg-white", "bg-whot"],
  },
  {
    slug: "ludo",
    name: "Ludo",
    players: "2–4 players",
    blurb: "Roll six to come out, then race all four seeds home.",
    swatch: ["bg-ludo-red", "bg-ludo-green", "bg-ludo-yellow", "bg-ludo-blue"],
  },
  {
    slug: "snakes",
    name: "Snakes & Ladders",
    players: "2–8 players",
    blurb: "Climb the ladders, dodge the snakes, land on 100.",
    swatch: ["bg-token-purple", "bg-token-orange", "bg-token-teal", "bg-token-pink"],
  },
  {
    slug: "tictactoe",
    name: "Tic-tac-toe",
    players: "2 players",
    blurb: "Three in a row. Play a quick series and settle it.",
    swatch: ["bg-ink", "bg-brand"],
  },
  {
    slug: "rps",
    name: "Rock Paper Scissors",
    players: "2–8 players",
    blurb: "One-on-one or a knockout bracket for the whole group.",
    swatch: ["bg-accent", "bg-ink", "bg-danger"],
  },
];
