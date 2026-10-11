// Football Draft in the Worker: the released player data, turned into the engine's cards and the
// game built on first use (so other rooms' cold starts don't pay for parsing it).
import {
  createFootballGame,
  type FootballDataset,
  type FootballPlayer,
  type GameDefinition,
  type RuleConfigBase,
} from "@gamehub/engine";
import type { CardPlayer } from "@gamehub/football-data/compact";
import { releaseCards } from "@gamehub/football-data/release";

type AnyGame = GameDefinition<unknown, unknown, unknown, RuleConfigBase>;

/** A compact card as the engine's player (stats back to named fields). */
export function toEnginePlayer(c: CardPlayer): FootballPlayer {
  const [a, b, d, e, f, g] = c.stats;
  return {
    id: c.id,
    name: c.name,
    short: c.short,
    group: c.group,
    positions: c.positions,
    ovr: c.ovr,
    stats: c.keeper
      ? { stp: a, rct: b, hdl: d, cmd: e, dst: f, agi: g }
      : { spd: a, fin: b, pas: d, skl: e, def: f, pow: g },
    nation: c.nation,
    club: c.club,
    league: c.league,
    era: c.era,
    potential: c.potential,
    ...(c.foot ? { foot: c.foot } : {}),
    roles: c.roles,
  };
}

let game: AnyGame | null = null;

export function footballGame(): AnyGame {
  if (!game) {
    const { version, cards } = releaseCards();
    const data: FootballDataset = { version, players: cards.map(toEnginePlayer) };
    game = createFootballGame(data) as unknown as AnyGame;
  }
  return game;
}
