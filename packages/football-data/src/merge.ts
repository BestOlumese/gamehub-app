import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The dataset is kept as one file per batch (`data/batches/*.json`, each `{ batch, players }`)
 * plus `data/meta.json` (`{ version, generatedAt }`), merged here in file-name order.
 */
export function readDataset(dir: string): unknown {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Record<string, unknown>;
  const batchDir = join(dir, "batches");
  const files = readdirSync(batchDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const players = files.flatMap((f) => {
    const b = JSON.parse(readFileSync(join(batchDir, f), "utf8")) as { players?: unknown[] };
    return b.players ?? [];
  });
  return { ...meta, players };
}
