# Batches

One JSON file per research batch, `{ "batch": "...", "players": [ ... ] }`, merged in file-name
order (`01-nigeria.json`, `02-africa-west.json`, …). Every player needs `basis` and `sources`.
Run `pnpm --filter football-data validate` after each batch.
