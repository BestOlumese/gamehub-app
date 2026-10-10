// pnpm --filter football-data compose
// Turns every data/specs/<batch>.json ({ batch, players: Spec[] }) into data/batches/<batch>.json.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { compose, type Spec } from "../compose.ts";

const root = new URL("../../data/", import.meta.url).pathname;
for (const f of readdirSync(`${root}specs`)
  .filter((x) => x.endsWith(".json"))
  .sort()) {
  const spec = JSON.parse(readFileSync(`${root}specs/${f}`, "utf8")) as {
    batch: string;
    players: Spec[];
  };
  const players = spec.players.map(compose);
  writeFileSync(
    `${root}batches/${f}`,
    `${JSON.stringify({ batch: spec.batch, players }, null, 2)}\n`,
  );
  console.log(`${f}: ${players.length} players`);
}
