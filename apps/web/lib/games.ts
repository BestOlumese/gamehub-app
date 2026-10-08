import type { GameSlug } from "@gamehub/engine";

export type GameInfo = {
  slug: GameSlug;
  name: string;
  players: string;
  blurb: string;
};

export const games: readonly GameInfo[] = [
  {
    slug: "whot",
    name: "Whot",
    players: "2–8 players",
    blurb: "Pick 2, Hold on, General market. Shout last card, then clear your hand first.",
  },
  {
    slug: "ludo",
    name: "Ludo",
    players: "2–4 players",
    blurb: "Roll six to come out, knock people off, and race all four seeds home.",
  },
  {
    slug: "snakes",
    name: "Snakes & Ladders",
    players: "2–8 players",
    blurb: "Climb the ladders, dodge the snakes, land on 100.",
  },
  {
    slug: "tictactoe",
    name: "Tic-tac-toe",
    players: "2 players",
    blurb: "Three in a row. Play a quick series and settle it.",
  },
  {
    slug: "rps",
    name: "Rock Paper Scissors",
    players: "2–8 players",
    blurb: "One-on-one or a knockout bracket for the whole group.",
  },
  {
    slug: "chess",
    name: "Chess",
    players: "2 players",
    blurb:
      "Proper chess with real clocks, from 1-minute bullet to slow games. Play a friend or a bot.",
  },
];
