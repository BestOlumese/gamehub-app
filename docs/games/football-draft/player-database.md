# Football Draft — player database

About **1,200 real footballers** at launch: current stars, **Legends** (retired greats at their prime), **Wonderkids** (under 21) and a strong Nigerian and African presence. Names and public facts only; **ratings are ours**.

Package: `packages/football-data` (new). Static, versioned JSON + Zod schema + validation script. The sample seed file (`packages/football-data/sample.players.json`, ~60 players) proves the format and the rating scale; the full set is built in its own phase (`phases.md`, "Football data").

## What a card may contain — and what it must never contain

| Allowed | Never |
|---|---|
| Name, short display name | Photos, likenesses, drawings of a real face |
| Positions, OVR and six face stats **we computed** | Club badges, kits, sponsor logos, league logos |
| Nation (flag emoji / our flag SVG) | EA FC / FIFA / SoFIFA / FUTBIN / PES / FM ratings or attribute numbers, or anything derived from them |
| **Current club as plain text** | Club crests or colours as identity |
| Era tag (Legends), potential tag (Wonderkids) | EA terms: "FUT", "Ultimate Team", "Icons", "Draft Token", "packs" |
| Preferred foot, birth year, height (optional) | Contract/salary/private data |
| Role familiarity (our roles) | Anything not publicly reported |

## Schema (Zod)

```ts
// packages/football-data/src/schema.ts
import { z } from "zod";

export const POSITIONS = ["GK","RB","CB","LB","RWB","LWB","DM","CM","AM","RM","LM","RW","LW","ST"] as const;
export const ROLES = [
  "shot_stopper","sweeper_keeper","ball_playing_keeper",
  "stopper","ball_playing_defender","covering_defender",
  "full_back","attacking_full_back","inverted_full_back",
  "wing_back","complete_wing_back",
  "anchor","deep_playmaker","ball_winner",
  "box_to_box","playmaker","roaming_midfielder",
  "classic_ten","shadow_striker","advanced_playmaker",
  "wide_midfielder","wide_playmaker","defensive_winger",
  "winger","inside_forward",
  "poacher","target_forward","false_nine","advanced_forward","pressing_forward",
] as const; // must match docs/games/football-draft/tactics.md

const stat = z.number().int().min(1).max(99);

export const outfieldStats = z.object({
  spd: stat,  // Speed
  fin: stat,  // Finishing
  pas: stat,  // Passing
  skl: stat,  // Skill (ball control, dribbling)
  def: stat,  // Defending
  pow: stat,  // Power (strength, aerials, stamina)
});

export const keeperStats = z.object({
  stp: stat,  // Shot-stopping
  rct: stat,  // Reactions
  hdl: stat,  // Handling
  cmd: stat,  // Command of the area (crosses, organisation)
  dst: stat,  // Distribution
  agi: stat,  // Agility
});

export const playerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/),          // stable slug, never reused: "victor-osimhen"
  name: z.string().min(2).max(60),                     // "Victor Osimhen"
  short: z.string().min(2).max(16),                    // "Osimhen"
  group: z.enum(["current", "legend", "wonderkid"]),
  positions: z.array(z.enum(POSITIONS)).min(1).max(3), // [primary, ...up to 2 alternates]
  ovr: z.number().int().min(40).max(96),
  stats: z.union([outfieldStats, keeperStats]),        // GK must use keeperStats, others outfieldStats
  nation: z.string().regex(/^[A-Z]{2}(-[A-Z]{3})?$/),  // ISO 3166-1 alpha-2; UK nations "GB-ENG", "GB-SCT", "GB-WLS", "GB-NIR"
  club: z.string().min(2).max(40).nullable(),          // current club, text only; null for legends / unknown
  clubAsOf: z.string().regex(/^\d{4}-\d{2}$/).nullable(), // month the club was verified
  league: z.string().min(2).max(40).nullable().optional(), // for chemistry, if we store it
  era: z.string().regex(/^Prime \d{4}–\d{4}$/).nullable(),          // legends only
  potential: z.enum(["high", "elite"]).nullable(),                   // wonderkids only
  foot: z.enum(["R", "L", "B"]).optional(),        // left out when it can't be confirmed (Oct 2026)
  birthYear: z.number().int().min(1900).max(2012).optional(),
  heightCm: z.number().int().min(150).max(210).optional(),
  roles: z.record(z.enum(ROLES), z.enum(["plus", "plusplus"])),      // known roles with familiarity
  basis: z.string().min(20).max(280),                  // why this rating (for review)
  sources: z.array(z.string().url()).max(5).optional(),// where the facts were checked
});
export type Player = z.infer<typeof playerSchema>;

export const datasetSchema = z.object({
  version: z.string().regex(/^\d{4}\.\d{2}\.\d+$/),    // e.g. "2027.01.1" (window-year.month.patch)
  generatedAt: z.string(),
  players: z.array(playerSchema),
});
```

Refinements (in the validator, below): GK ⇔ `keeperStats`; `era` only and always for legends; `potential` only and always for wonderkids; wonderkids born ≥ data year − 20; roles must belong to one of the player's positions (or a neighbouring position group).

### Compact runtime format
The realtime Worker needs the data to build option sets. `pnpm --filter football-data build` emits `dist/players.min.json` as **tuples** (`[id, short, posBits, ovr, s1..s6, nationIdx, clubIdx, flags, roleBits]` + lookup tables for nations/clubs/names). Estimated size for 1,200 players: ~110–140 KB raw, ~35–45 KB gzip (⚠️ estimate; measure in the data phase). The Worker parses it **lazily on the first football action** of an isolate and keeps it in module scope (cold-start CPU matters on Free — `13-free-tier-budget.md`). The browser never downloads the database: option sets arrive inside the seat's view with full card data.

## Face stats — definitions

| Stat | Outfield meaning | Main public inputs |
|---|---|---|
| **SPD** Speed | Pace over 10–40 m, acceleration | Reported sprint data where public, role (wide/forward), consistent scouting descriptions |
| **FIN** Finishing | Turning chances into goals | Non-penalty goals per 90, shot conversion, goals vs expected goals over 2–3 seasons |
| **PAS** Passing | Range and accuracy, chance creation | Assists, key passes, progressive passes per 90 (context-adjusted) |
| **SKL** Skill | Ball control, dribbling, press resistance | Successful take-ons, ball retention under pressure |
| **DEF** Defending | Tackling, interceptions, positioning | Tackles + interceptions per 90 adjusted for team possession, duel and aerial win rates, defensive role |
| **POW** Power | Strength, aerial ability, stamina | Aerial duels won, physical duels, minutes/season, height (signal) |

| Keeper stat | Meaning | Inputs |
|---|---|---|
| **STP** Shot-stopping | Saving shots | Save %, goals prevented vs expected (post-shot xG) where public |
| **RCT** Reactions | Close-range and second saves | Reputation + save % on close shots where public |
| **HDL** Handling | Clean catches, few spills | Errors leading to goals (low = good) |
| **CMD** Command | Crosses, organising the box | Crosses claimed, aerial reputation |
| **DST** Distribution | Kicking and passing | Pass completion, launch accuracy |
| **AGI** Agility | Diving range, footwork | Scouting consensus |

## Rating methodology (GameHub ratings)

**Goal:** a believable, consistent 1–99 scale that feels like a football game without copying anyone's numbers. Best current player ≈ **91**. Greatest legends ≈ **94–95** at their prime.

1. **Evidence per player** (last 2–3 seasons for current players): minutes, goals, assists, clean sheets, the metrics in the face-stat table, **level of league and club**, international caps and role, awards (league/continental player-of-season, Ballon d'Or top 30, AFCON/World Cup honours), **market value only as a signal** (cross-check, never an input to the formula), and reputation.
2. **Face stats:** each stat starts as the player's **percentile within his position group** in our evidence pool, mapped to 45–92, then multiplied by the **league strength factor** below and clamped to 1–99. Reviewer adjusts by ±5 with a reason in `basis`.

   | League tier (examples) | Factor |
   |---|---|
   | Big five (England, Spain, Germany, Italy, France) | 1.00 |
   | Other strong European leagues (Portugal, Netherlands, Belgium, Turkey…) | 0.95 |
   | Saudi Pro League, MLS, other mid-strength leagues | 0.92 |
   | Strong African leagues (Egypt, Morocco, South Africa, Tunisia) | 0.86 |
   | **NPFL** and similar | 0.80 |

   (Proposal: tune the factors in the data phase by checking players who moved between tiers.)
3. **Position OVR** = weighted sum of face stats with the position's weights:

   | Position | SPD | FIN | PAS | SKL | DEF | POW |
   |---|---|---|---|---|---|---|
   | ST | 0.15 | 0.40 | 0.08 | 0.17 | 0.02 | 0.18 |
   | RW/LW | 0.25 | 0.22 | 0.15 | 0.28 | 0.03 | 0.07 |
   | AM | 0.10 | 0.18 | 0.32 | 0.30 | 0.04 | 0.06 |
   | RM/LM | 0.22 | 0.12 | 0.24 | 0.22 | 0.10 | 0.10 |
   | CM | 0.08 | 0.08 | 0.34 | 0.22 | 0.16 | 0.12 |
   | DM | 0.06 | 0.03 | 0.26 | 0.12 | 0.35 | 0.18 |
   | RB/LB | 0.20 | 0.02 | 0.16 | 0.10 | 0.36 | 0.16 |
   | RWB/LWB | 0.24 | 0.04 | 0.20 | 0.14 | 0.26 | 0.12 |
   | CB | 0.10 | 0.01 | 0.09 | 0.05 | 0.50 | 0.25 |

   Keepers: OVR = 0.30 STP + 0.22 RCT + 0.16 HDL + 0.14 CMD + 0.08 DST + 0.10 AGI.
4. **Reputation adjustment**, −2 … +3: sustained elite level (multiple seasons), major awards, captaincy of a top national side. Written in `basis`.
5. **Calibration anchors** (checked after every batch):

   | Band | Target count in 1,200 | Who |
   |---|---|---|
   | 89–91 | 4–8 | The very best current players |
   | 85–88 | 40–60 | World-class regulars, best legends' teammates |
   | 80–84 | 180–240 | Top-club starters, best African league stars, strong legends |
   | 74–79 | 330–400 | Big-five regulars, national-team regulars |
   | 65–73 | 280–350 | Good-league regulars, NPFL stars |
   | ≤ 64 | 120–180 | Squad players, young prospects, NPFL regulars |
   Legends sit 80–95 (they're the "rare" pool by design).
6. **Legends** are rated at their **prime** (best 3–5 consecutive seasons), with `era: "Prime 1996–2003"`. Anchors: Pelé, Maradona ≈ 95; Cruyff, Zidane, Ronaldo (Brazil) ≈ 94; Nigerian greats compared with their contemporaries (e.g. Okocha ≈ 89 next to the late-1990s elite). No modern statistics exist for older eras → `basis` cites awards, contemporaneous rankings and records.
7. **Wonderkids** (under 21 at the data cut-off): rated on **current ability** like anyone else, plus a **potential tag**: `high` (likely to settle 82–86) or `elite` (87+), from minutes at a young age, level, and international selection. Only the tag is shown, not a number.
8. **Review:** every player has a 20–280 character `basis` ("14 G+A in 22 Serie A starts 2025/26; AFCON 2025 best XI; pace elite; +2 reputation") and, in the full data set, 1–5 `sources`. Facts in `basis` must be supported by the cited sources.

## Positions and roles on cards
- `positions[0]` is primary; alternates only where the player has played there regularly (≥ 15 % of recent minutes, or famous for it).
- `roles`: 1–4 entries with `plus` / `plusplus` (`tactics.md`). `plusplus` = signature role (the role the player is famous for); `plus` = clearly capable.

## Quotas (launch dataset)

| Quota | Minimum |
|---|---|
| Total players | 1,200 (target 1,150–1,300) |
| **Nigerian** players (current + legends + wonderkids) | **≥ 120** |
| **African** players (incl. Nigerian) | **≥ 250** |
| Current Super Eagles squad members (last 2 call-up lists) | 100 % |
| **NPFL** players | ≥ 30 (top scorers, best keepers, current call-ups) |
| Legends | ≥ 150 (≥ 25 Nigerian, ≥ 50 African) |
| Wonderkids | ≥ 80 (≥ 10 Nigerian) |
| Goalkeepers | ≥ 110 |
| Each other position (primary) | ≥ 40 |
| Players per nation | no nation > 15 % of the set |

## Validation script (`pnpm --filter football-data validate`)
Fails CI if any check fails:
1. Every record passes `playerSchema`; dataset `version` bumped when content changes (hash check).
2. **No duplicate `id`s**; no duplicate (name + birthYear) pairs.
3. Positions valid; GK ⇔ keeper stats; roles belong to the player's positions.
4. Stat ranges; `ovr` within ±3 of the formula value from face stats + reputation (catches typos).
5. Group rules: `era` iff legend, `potential` iff wonderkid, wonderkid age check.
6. **Quotas** above met.
7. **Rating distribution sanity:** band counts within the anchor table ± 25 %; median OVR 72–76; max current OVR ≤ 92; max legend ≤ 96.
8. `basis` present (≥ 20 chars); `clubAsOf` present when `club` is set; `clubAsOf` no older than 8 months at release.
9. Banned-words check: no "FUT", "Ultimate Team", "Icon", "TOTY", "pack" in any text field.
10. Prints a summary (counts by group, nation, position, band) into the PR.

## Building the data (its own phase, in batches)
- **Batch = one nation or one league**, ≈ 50–120 players: e.g. Super Eagles + NPFL; Ghana/Cameroon/Senegal/Côte d'Ivoire; Egypt/Morocco/Algeria/Tunisia; Premier League; La Liga; Serie A; Bundesliga; Ligue 1; rest of world; Legends (by decade); Wonderkids.
- For each batch: research online (official club/league/national-team sites for squads; reputable stats providers' public pages for numbers; Wikipedia for careers and awards), fill records with `basis` and `sources`, run the validator, open a PR with the summary; only facts that a cited source supports go into `basis` (no per-batch human review; Best, Oct 2026). Batches are written as short specs (`data/specs/`: name, positions, OVR, playing style, roles, basis, sources) and `pnpm --filter football-data compose` generates the face stats from the style's template so the position formula lands on the chosen OVR; hand-set stats override the template.
- **Transfermarkt-derived datasets** (e.g. `dcaribou/transfermarkt-datasets`, CC0 code/data, scraped from Transfermarkt, **updates paused since 6 July 2026**) may be used as a **research aid only** (to find names, ages, clubs to then verify) — never imported wholesale, never as the source of record. Transfermarkt's own database rights are unclear (`concerns.md`).
- **Never** open or use EA FC / FIFA / SoFIFA / FUTBIN / FM databases or rating sites while rating players.

## Update process
- After each **transfer window** — early **February** (January window) and early **September** (summer window): refresh `club`/`clubAsOf` for current players, re-rate players whose level changed (new league tier, big season), add new call-ups and breakout wonderkids, move players who turned 21 out of `wonderkid`, and retire players into `legend` only after a cooling-off (≥ 2 years retired).
- Bump `version` (`2027.02.1`, `2027.09.1` …). Rooms record the data version at start; a running tournament keeps its version.
- Takedown/contact: any player or representative can ask for removal via the contact address on `/legal/terms`; removal ships in the next patch version within 14 days (`concerns.md`).

## Sources policy
Allowed for research: official club / league / federation websites, Wikipedia (careers, caps, honours), public statistics pages of reputable providers (cite page and season), reputable news for transfers. Each player's `sources` lists what was used. Not allowed: any video-game rating database or anything derived from one; bulk scraping of any site; paid data.
