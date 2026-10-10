// pnpm --filter football-data validate [--release]
// Validates the 60-player sample (format proof) and the batches in data/ (progress, or a release).
import { existsSync, readFileSync } from "node:fs";
import { readDataset } from "../merge.ts";
import { validate, type Report } from "../validate.ts";

const root = new URL("../../", import.meta.url).pathname;
const release = process.argv.includes("--release");
const today = new Date().toISOString().slice(0, 7);
const hashesFile = `${root}data/hashes.json`;
const knownHashes = existsSync(hashesFile)
  ? (JSON.parse(readFileSync(hashesFile, "utf8")) as Record<string, string>)
  : {};

function show(title: string, r: Report) {
  console.log(`\n## ${title}`);
  for (const line of r.summary) console.log(`- ${line}`);
  for (const w of r.warnings) console.log(`  warning: ${w}`);
  for (const e of r.errors) console.log(`  ERROR: ${e}`);
  return r.errors.length;
}

let failed = show(
  "Sample (format proof)",
  validate(JSON.parse(readFileSync(`${root}sample.players.json`, "utf8")), {
    mode: "sample",
    today,
  }),
);
if (existsSync(`${root}data/meta.json`))
  failed += show(
    release ? "Dataset (release)" : "Dataset (batches so far)",
    validate(readDataset(`${root}data`), {
      mode: release ? "release" : "batch",
      today,
      knownHashes,
    }),
  );
console.log(failed ? `\n${failed} problem(s).` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
