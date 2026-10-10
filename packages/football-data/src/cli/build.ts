// pnpm --filter football-data build [--release]
// Validates the batches, then writes dist/players.min.json (compact, for the realtime Worker).
// With --release: the full release checks, and the version's content hash is recorded in
// data/hashes.json (that version's content is then frozen).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { toCompact } from "../compact.ts";
import { readDataset } from "../merge.ts";
import { datasetSchema } from "../schema.ts";
import { validate } from "../validate.ts";

const root = new URL("../../", import.meta.url).pathname;
const today = new Date().toISOString().slice(0, 7);
const hashesFile = `${root}data/hashes.json`;
const hashes = existsSync(hashesFile)
  ? (JSON.parse(readFileSync(hashesFile, "utf8")) as Record<string, string>)
  : {};
const raw = readDataset(`${root}data`);
const release = process.argv.includes("--release");
const report = validate(raw, { mode: release ? "release" : "batch", today, knownHashes: hashes });
if (report.errors.length) {
  for (const e of report.errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
const data = datasetSchema.parse(raw);
const json = JSON.stringify(toCompact(data));
mkdirSync(`${root}dist`, { recursive: true });
writeFileSync(`${root}dist/players.min.json`, json);
if (release) {
  hashes[data.version] = report.hash;
  writeFileSync(hashesFile, `${JSON.stringify(hashes, null, 2)}\n`);
}
console.log(
  `${data.players.length} players → dist/players.min.json: ${(json.length / 1024).toFixed(1)} KB, ${(gzipSync(json).length / 1024).toFixed(1)} KB gzip`,
);
