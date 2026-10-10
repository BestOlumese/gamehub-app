# Batches

Generated files: don't edit them. Each batch is written as a short spec in `../specs/` (name,
positions, OVR, playing style, roles, basis, sources) and `pnpm --filter football-data compose`
turns it into the full records here: face stats come from the style's template, shifted so the
position formula gives the chosen OVR (hand-set `stats` override it). A test fails if a batch
and its spec drift apart.

Batches merge in file-name order (`01-nigeria.json`, `02-…`). Every player needs `basis` and
`sources`. Run `pnpm --filter football-data validate` after each batch.
