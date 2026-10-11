// Tests only: the real player data (packages/football-data batches), read as plain JSON so the
// engine keeps no dependency on the data package.
import b1 from "../../../../football-data/data/batches/01-nigeria.json";
import b2 from "../../../../football-data/data/batches/02-npfl.json";
import b3 from "../../../../football-data/data/batches/03-africa.json";
import b4 from "../../../../football-data/data/batches/04-europe.json";
import b5 from "../../../../football-data/data/batches/05-americas-asia.json";
import b6 from "../../../../football-data/data/batches/06-legends.json";
import b7 from "../../../../football-data/data/batches/07-young.json";
import type { FootballDataset, FootballPlayer } from "./types";

export const testDataset: FootballDataset = {
  version: "test",
  players: [b1, b2, b3, b4, b5, b6, b7].flatMap(
    (b) => (b as unknown as { players: FootballPlayer[] }).players,
  ),
};
