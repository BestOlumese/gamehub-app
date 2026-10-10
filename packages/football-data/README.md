# @gamehub/football-data

The player database for **Football Draft** (`docs/games/football-draft/`). Static, versioned JSON validated by a Zod schema.

> Status: **tooling built (Phase 10).** Schema, validator and compact build are in `src/`; the 60-player `sample.players.json` passes. The full ~1,200-player set is added batch by batch in `data/batches/`. Spec: `docs/games/football-draft/player-database.md`.

## What's in a record

Names and public facts only, with **our own ratings**. No photos, badges, kits, logos, or numbers from any video game or rating site. Not affiliated with any club, league, player, EA or FIFA.

| Field               | Example                                                                     | Notes                                                                |
| ------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `id`                | `victor-osimhen`                                                            | Stable slug, never reused                                            |
| `name`, `short`     | `Victor Osimhen`, `Osimhen`                                                 | `short` ≤ 16 chars for cards                                         |
| `group`             | `current` · `legend` · `wonderkid`                                          |                                                                      |
| `positions`         | `["ST"]`                                                                    | Primary + up to 2 alternates (14 positions, `tactics.md`)            |
| `ovr`               | `86`                                                                        | 1–99; best current player ≈ 91, greatest legends ≈ 95                |
| `stats`             | `{spd, fin, pas, skl, def, pow}` or keeper `{stp, rct, hdl, cmd, dst, agi}` | Our six face stats                                                   |
| `nation`            | `NG`, `GB-ENG`                                                              | ISO 3166-1 alpha-2 (UK nations as subdivisions)                      |
| `club`, `clubAsOf`  | `Galatasaray`, `2026-10`                                                    | Text only; `null` when not verified after the latest transfer window |
| `era`               | `Prime 1996–2003`                                                           | Legends only                                                         |
| `potential`         | `high` · `elite`                                                            | Wonderkids only                                                      |
| `foot`, `birthYear` | `R`, `1998`                                                                 |                                                                      |
| `roles`             | `{ "advanced_forward": "plusplus" }`                                        | Our roles and familiarity (`tactics.md`)                             |
| `basis`             | "2023 African Footballer of the Year; …"                                    | Why this rating, for review (20–280 chars)                           |

## The sample (`sample.players.json`, version `2026.10.0`)

| Group                                            | Count  |
| ------------------------------------------------ | ------ |
| Current players                                  | 26     |
| Legends                                          | 27     |
| Wonderkids (under 21)                            | 7      |
| **Nigerian** (current, NPFL, legends, wonderkid) | **25** |
| African (incl. Nigerian)                         | 34     |

- **Every position** appears as a primary position (GK, RB, CB, LB, RWB, LWB, DM, CM, AM, RM, LM, RW, LW, ST).
- **Rating scale proof:** current stars 85–91 (Mbappé 91, Haaland 90, Kane 89, Yamal 89); Super Eagles regulars 74–86 (Osimhen 86, Lookman 84, Aina 80); NPFL top scorers 66–67 (league factor 0.80); legends 83–95 (Pelé and Maradona 95; Okocha 89; Yekini 86).
- Each player's OVR equals the documented position formula applied to his face stats, plus a reputation adjustment of −2 … +3 (so the validator's "OVR within ±3 of the formula" rule holds by construction).
- **Clubs** were checked online in October 2026 (`docs/research/sources.md`) for: Osimhen, Lookman, Iwobi, Bassey, Aina, Chukwueze, Onyedika, Nwabali, Mbappé, Haaland, Bellingham, Vinícius, Kane, Yamal, and the two NPFL players (as of May 2026). Everyone else has `club: null` until the data phase verifies them — including Salah, whose Liverpool exit was announced in March 2026.
- Ratings are **ours**, built from public facts (honours, roles, league level, reputation) in each `basis`. They have not been compared with any video game.

## Commands

```bash
pnpm --filter football-data validate             # sample + batches so far (quota progress)
pnpm --filter football-data validate --release   # everything, quotas and rating spread included
pnpm --filter football-data build                # dist/players.min.json (compact tuples for the realtime Worker)
pnpm --filter football-data build --release      # also freezes the version's content hash (data/hashes.json)
```

Node 24 runs the scripts straight from TypeScript (imports name their `.ts` files). `pnpm test` also validates the batches, so CI fails on a bad record.
