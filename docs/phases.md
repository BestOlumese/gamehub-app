# Phases

Build in this order. Each phase ends with its exit criteria met and deployed to the free URLs. Don't start a phase before the previous one's exit criteria pass.

---

## Phase 0 — Foundation
- [x] pnpm + Turborepo monorepo with `apps/web`, `apps/realtime`, `packages/{engine,protocol,db,ui,config}`.
- [x] TypeScript strict configs, ESLint, Prettier, Vitest wired in every package.
- [x] Next.js 16 app: fonts, Tailwind v4 tokens from `11-design-system.md`, base layout, landing page placeholder.
- [x] Worker + 3 empty SQLite DO classes, `wrangler.jsonc` with `new_sqlite_classes` migration.
- [x] Neon project (Frankfurt), Drizzle set up, first migration.
- [x] Vercel (fra1) + Cloudflare deploys from `main`; preview deploys for PRs.
- [x] CI: lint, typecheck, tests, bundle budget script, Lighthouse CI.

**Exit:** both apps deployed; landing scores ≥ 95 on Lighthouse mobile; CI green.

## Phase 1 — Auth & accounts
- [x] Better Auth with Drizzle adapter; email+password with required verification; Google.
- [x] Nodemailer + Gmail SMTP, templates, `email_log` quota guard (480/24 h), resend cooldowns.
- [x] Sign-up (DOB 18+ gate, Turnstile), login, verify-email page, forgot/reset password, change password/email, delete account.
- [x] Onboarding: DOB for Google users, username picker (profanity + reserved names).
- [x] Middleware: verified + adult + username required for app routes; bans.
- [x] Legal pages: terms, privacy.
- [x] E2E: sign-up/verify/reset flows with Mailpit.

**Exit:** a new user can sign up with email or Google and reach `/home`; under-18 refused; all auth E2E green.

## Phase 2 — Realtime core + Tic-tac-toe
- [x] `protocol`: envelopes, room messages, tickets, close codes.
- [x] Ticket endpoint + Worker verification (`jose`), Origin checks.
- [x] `GameRoom` DO: lobby, seats, start, action loop, single-row persistence, single-alarm deadline scheduler, per-seat views, idempotency, rate limits.
- [x] Engine contract + seeded RNG + **Tic-tac-toe** (rules, bots, tests).
- [x] Private room create/join (code, WhatsApp share, `/r/<code>`), lobby UI, game screen shell.
- [x] partysocket client with fresh tickets, reconnection UI, seat states, grace → bot, turn timers.
- [x] DO tests incl. hibernation and rows-written ≤ 2.

**Exit:** two phones on mobile data play a TTT series; toggling airplane mode for 10 s and 70 s behaves exactly as `04-reconnection.md` says.

## Phase 3 — Rock Paper Scissors
- [x] Simultaneous hidden picks, duel + knockout bracket, bots, tests.
- [x] Bracket UI and spectator view for eliminated players.

**Exit:** 8-player RPS knockout with 5 bots completes; no pick leaks before reveal (test).

## Phase 4 — Whot
- [x] Full rules engine from `games/whot.md` with every option; bots (3 levels); property tests (54-card conservation, no leaks).
- [x] Rules sheet UI for all options with "Naija Standard" reset.
- [x] Card sprite, hand/pile/market UI, shape picker, LAST CARD button, penalty indicators, sounds.

**Exit:** 4-player game (2 humans, 2 bots) to the end on low-end Android with no jank; all Whot tests green.

## Phase 5 — Ludo
- [x] Engine from `games/ludo.md`, bots, tests.
- [x] SVG board, seed movement with hop animation, die, auto-move for single legal move.

**Exit:** 4-player Ludo game completes; reconnect mid-move works; rows written per game within budget estimate.

## Phase 6 — Snakes & Ladders
- [x] Engine and four boards of our own (Naija Classic, Quick, Lagos Traffic, Balanced) passing the simulation test. The 1943 classic layout was checked and dropped (trade dress, `concerns.md` #12).
- [x] Data-driven SVG board, 8 pin tokens (shape + colour + initial), hop-and-slide playback, shared die, rules step with board previews.
- [x] DO test: 8-bot game ends with every place, within the write budget. E2E: 2 people + 6 bots finish an 8-player game (Pixel 7 and 360 × 640).

**Exit:** 8-player game completes; presets pass simulation.

## Player feedback (Oct 2026, between Phases 6 and 7)
- [x] Host edits the room in the lobby: game, seat count, rules, bot fill (same setup sheet, filled in). DO + E2E tested.
- [x] "Shuffle seats" in the lobby; "Who goes first" room setting (Random default, Takes turns, Last winner, Seat 1). Every engine's `setup` takes the first seat.
- [x] Whot decking (house rule, off by default): same number / same number or shape / chain, every special counts, Whot only last. Engine examples + properties, bots, E2E. See `games/whot.md`.

## Phase 7 — Chess (+ bot service)
- [x] Engine `games/chess` on chess.js 1.4.0 (BSD): FEN + move list + position history (repetition from history, not a map), all draw rules (`drawClaims` auto/claim), abort, draw offers, takebacks, resign.
- [x] Server-authoritative clocks: presets 1+0 … 30+0 and No clock (`moveLimitSeconds`), lichess-style lag quota, flag alarm (`turnDeadline`), `mt` on the move action, premoves (client queue, `mt = 0`).
- [x] Engine contract update: `ctx.now` authoritative for clocked games; server-only `flag`; `turnDeadline`, `botReply`, `aborted`.
- [x] Easy bot (our 0x88 searcher, node budget) in the DO; perft on the six standard positions plus a chess.js cross-check.
- [x] **Bot service** in `apps/web` (`/api/bots/chess/move`): Stockfish 19 lite in a worker thread, HMAC (`BOT_HMAC_SECRET`), strength mapping, queue, watchdog; `Quota` DO (migration `v2`) with daily budget; silent fallback in the room (DO-tested).
- [x] Our SVG board + Cburnett pieces (BSD, credited on `/legal/credits`), move strip, PGN copy, promotion picker, clocks, sounds, square buttons for keyboards and screen readers, move announcements. Design agreed with Best (mockups).
- [x] FEN copy, a typed-move box (`e4`, `Nf3`, `O-O`) and arrow keys through the moves (wider screens).
- [x] CPU budget checked with the Node proxy (`13-free-tier-budget.md`): apply 1.7 ms median / 3.7 ms p95; Easy bot p95 ≈ 4.5 ms, Easy+ ≈ 5.5 ms after the Oct 2026 speed-up (was 31 / 89 ms). **Moved to Phase 16:** the on-Cloudflare benchmark (`BENCH=1` bench Worker, `cpuTime` from Workers analytics; needs a token with analytics read), run for every game at once.
- [x] Bot strength calibration: Medium beats Easy 83 %, Hard beats Medium 88 % (20 games each, `15-bot-service.md`).
- [x] Disconnect rules (unranked): after the grace, a Medium bot plays the seat on that player's own clock; they get the seat back on return (DO-tested). **Moved to Phase 13:** the ranked claim-win flow (listed there with ranked chess).
- [x] Production secret `BOT_HMAC_SECRET` set in Vercel and Cloudflare (Best, Oct 2026); the live route answers unsigned calls with 401.

**Exit:** two phones play a 3+2 game to a flag and another to checkmate with premoves; a private game vs Hard finishes (bot service live, and the fallback path proven by switching the service off); perft passes; benchmark p95 ≤ 5 ms per action; no GPL file in `.next/static`.

## Phase 8 — Draughts
- [x] Engine `games/draughts`: `naija10` (mirrored board, random first move, men capture backward, flying kings, majority/free capture, Turkish strike, promotion only at end, huffing option) and `english8`; notation 1–50 / 1–32; FMJD and English draw rules. Perft matches the published international (to depth 5) and checkers (to depth 6) counts; a second, plain generator agrees over 200 random games per rule set.
- [x] Bots: Easy/Medium in the DO (node budgets 1,000 / 3,000), Hard in the bot service (`/api/bots/draughts/move`); clocks shared with chess (`games/clock.ts`; No clock default). Medium beats Easy over 20 test games (> 60 %).
- [x] Board UI with capture hints, tap-the-final-square multi-captures (hops only when ambiguous), huffing, PDN copy. Design agreed with Best (green and cream, bottle caps, chess layout).
- [x] Hard v Easy ≥ 60 %: **Hard scores 93 %** v Easy (26 wins, 4 draws, 0 losses) and 83 % v Medium (21–1, 8 drawn), 30 games each, 150 ms a move (Oct 2026).
- [x] Two phones finished a Naija draft game and an English game on the live site (Best, Oct 2026).
- Moved to Phase 16: a CPU benchmark of Easy/Medium on Cloudflare itself.
- [x] Capture default: **free choice** (Best, Oct 2026); majority is a setting.

**Exit:** a Naija draft game and an English game complete between two phones; all capture/promotion edge-case tests green; Hard beats Easy > 60 %.

## Phase 9 — Property-trading game
- [x] Name: **Naija Plots** (Best, Oct 2026; slug `plots`). Still to do: a proper trademark check (NG registry + WIPO) before any promotion.
- [x] Engine `games/plots`: board, economy from the formula, both decks, Police Post, building rules with supply (shortages first come, first served), mortgages, debts, bankruptcy, timed (net worth) and classic modes, trading, auctions (bids persisted), all options.
- [x] Bots with valuation (Easy/Medium/Hard; Medium and Hard propose group-completing trades); chained bot turns.
- [x] Money, building and deck invariants checked after every action in whole bot games; **balance simulation** passing all bands (`games/property-balance.md`), rent table regenerated.
- [x] UI: board, plot cards, auction panel, trade composer, player strip, result sheet, rules step; built to the agreed design (`11-design-system.md` → Naija Plots). E2E: 2 people + 2 bots (buy, plot card, trade sheet) and 8 players on a 360 px phone with an auction.
- [x] Pick your token in the lobby (`token` message, one per person; bots and anyone who doesn't pick get the first free one in seat order). Room-tested and in the E2E.
- [x] Exit checks on the live site (Best, Oct 2026: all fine): a 4-player timed game ends by the clock with the right places; an 8-player game on a low-end phone; rows per game against the estimate (Cloudflare dashboard).

**Exit:** a 4-player timed game (2 humans, 2 bots) ends by the clock with correct net worth places; an 8-player game runs smoothly on a low-end phone; balance report attached; rows per game within the estimate.

## Phase 10 — Football data (batches)
- [x] `packages/football-data`: Zod schema, validator (quotas, distribution, banned words, sources, club freshness, frozen versions), compact build, the 60-player sample passing; batches in `data/batches/`, validated in CI.
- [x] Batches, each researched online with `basis` + `sources`: Super Eagles + NPFL → other African nations → each big-five league → rest of world → Legends (by decade) → Wonderkids.
  - [x] 01 Super Eagles (86) and 02 NPFL (26 more; 33 NPFL in all), Oct 2026.
  - [x] 03 Africa (299 from 16 nations' squads and call-ups), Oct 2026.
  - [x] 04 Europe (568 from 24 nations' squads and call-ups; covers the big-five leagues), Oct 2026.
  - [x] 05 Americas and Asia (248 from 14 nations), Oct 2026. Full-backs and wingers also list their natural wide alternate (wing-back / wide midfield).
  - [x] 06 Legends (193: 38 Nigerian, 76 African), each with its Wikipedia source checked to exist.
  - [x] 07 Young players (36 from the Nigeria, Morocco, Ghana and Senegal U-20 squads) and six more NPFL scorers. Red-link sources dropped.
- [x] Quotas met (release 2026.10.1): 1,462 players, 172 Nigerian, 529 African, 43 NPFL, 193 Legends, 110 Wonderkids, 131 GKs; distribution bands within ±25 %.
- [x] Disclaimer + takedown address on `/legal/terms`. Still to do before promotion: a short legal review (`concerns.md`).

**Exit:** validator green on the full set; facts only from cited sources (no per-batch review: Best, Oct 2026; one optional look at the end); data version `YYYY.MM.1` tagged.

## Phase 11 — Football Draft
- [x] Engine `games/football`: draft (option-set sampler, guarantees, presets, auto-pick), tactics/roles/chemistry, match engine, extra time/penalties, commentary templates, bot managers; `createFootballGame(dataset)`.
- [x] Draft distribution test and match Monte Carlo bands passing; tuning logs filled in the docs.
- [x] **Live decisions** (Best, Oct 2026): shouts, tactics, roles, formation and subs at any minute; matches sent in 3-minute chunks; tactical matchups worth ≈ 5 rating points.
- [x] Modes: 1v1 (single / best of 3), mini league, knockout, solo run. The `football_solo_run` record came with Phase 13. Not built: checkpointed picks (every pick is a write; costs in `13-free-tier-budget.md`).
- [x] UI: option-set cards (no FC look-alike), pitch, tactics sheet, commentary feed + ticker, mini-pitch, results. Designed with Best (mockups, Oct 2026).

**Exit:** two phones draft and play a full match with half-time changes; an 8-manager league (bots) finishes; a solo run of 4 matches works; hidden-info test proves no option leaks; CPU benchmark p95 ≤ 5 ms.
All met (Oct 2026): E2E "two phones … half-time sub" and "solo run on a 360 px phone"; engine tests for every mode (leagues and knockouts up to 8 bots in the fuzz), hidden-info tests in the engine and the Worker; a tick p95 2.5 ms with four matches at once. Still for Best on the live site: a match on a real phone, and rows per game against the estimate.

## Phase 12 — Tournament mode
- [x] `Tournament` DO (migration `v3`; `v2` went to `Quota`), 7-char codes, lobby socket, stage editor with validation and projected flow, capacity estimate warning (static estimate; the "today's usage" part waits for a Quota read endpoint).
- [x] Seeding, table spreading, byes (fewest-byes first), tie-breaks (coin toss, logged), `initTable` / `reportTable` as internal fetches on the DO stubs (partyserver only initialises on fetch, not raw RPC), auto-navigation, bots that can advance, football squads kept across stages (with player aliases so two squads can share a player).
- [x] First result-ingest endpoint in `web` (`/api/internal/tournament-result`, HMAC) + `match`, `match_player`, `tournament`, `tournament_stage`, `tournament_entry` tables (migration `0002_tournaments`); tournament wins and podiums show on Home (the profile page arrives in Phase 13).
- [x] Bracket UI, designed with Best (Oct 17 2026, mockups): Home card, stage cards + sheet, stage tabs + table cards, "Your table is ready" sheet.

**Exit:** a 16-entrant tournament (6 humans across phones + 10 bots) with three stages of different games finishes with correct placements stored in Neon; a player who drops mid-stage is advanced by their bot and gets their seat back; bracket property tests green.
As built (Oct 2026): bracket property tests (1,000 random plans played out with random results and ties), DO tests (lobby, start, whole bot tournaments of 4 and 8, a repeated report ignored, results posted once and signed), E2E "4 people and 4 bots, tables of 4 then a knockout" (setup, join by code, sent to tables and back, final places stored in Postgres). Still for Best on the live site: the 16-entrant, 6-phone, three-game run.

## Phase 13 — Quick-match, ratings, history (was Phase 7)
- [x] `Matchmaker` DO with FIFO, 20 s bot-fill (unranked) + "keep waiting" option (3 min); queues for every game incl. `chess-<preset>`, `draughts-<variant>-5+3`, `plots-<size>`, `football-2`. As built: one global instance (so one queue or one game per person; rooms tell it when players are free).
- [x] Signed match-result ingest (`/api/internal/match-result`; every private and quick room reports each game), `match`/`match_player`/`user_stats`/`rating` keyed by **game and variant**, openskill updates, pair-farming cap (5 a day per pair and game).
- [x] Ranked chess (bullet/blitz/rapid) and draughts (naija10/english8, 5+3: Best, Oct 2026) incl. the ranked disconnect claim-win flow (`gone` / `claim_victory` / `claim_absent_draw`; leaving is resigning); property and football stay unranked.
- [x] Profile page (`/u/<username>`): stats and ratings per pool, last 20 matches (incl. tournament tables), football solo-run record, tournament wins/podiums.
- [x] Leaderboards (`/leaderboards`): weekly + all-time per game **and variant**, cached (`use cache` + tag), expired on ingest.
- Designed with Best (Oct 17 2026, mockups): Quick match on each tile, full-page queue, profile with game cards, leaderboards with game/variant chips.

**Exit:** two accounts quick-match chess blitz, finish a ranked game, both see rating changes in the blitz pool; a draughts ranked game updates the naija10 pool; leaderboards show both.
Met (Oct 2026): E2E "quick match: ranked chess blitz and draughts" (the tile's sheet, the queue, both into one ranked room, profiles with the rating change, both leaderboards); DO tests for matching, bot fill, keep waiting / giving up, one queue at a time, and the ranked claim.

## Phase 14 — Friends, presence, invites, spectating (was Phase 8)
- [x] `Presence` DO (one global; online from its sockets, in-game and in-a-tournament reported by rooms and tournaments), friend requests/accept/decline/cancel, remove, block (migration `0005_friends`).
- [x] Invites to rooms and tournaments (toast on any signed-in page, 2 min), watch a friend's game (Home strip, Friends page), spectator mode: "Watching @name · Game" bar, players see an eye with the count, at most 20 watchers. Views were already per seat (chess/draughts public with clocks, property public state, football never sends option sets or unrevealed teams to spectators; tested since Phases 7–11).
- Designed with Best (Oct 17 2026, mockups): /friends + a Home strip, Invite friends in lobbies + toasts, the Watching bar, Add friend and ⋯ (Remove, Block) on profiles.

**Exit:** friend A invites B from the friends list; B joins in two taps; C spectates without seeing hands or draft options.
Met (Oct 2026): E2E "friends: A invites B from the lobby, B joins from the toast; C watches without seeing hands" (B: Join, and they're seated); DO tests for presence (online/offline, a real room's game start, invites signed and delivered, the watcher count). Draft options for spectators: the football hidden-info tests.

## Phase 15 — Chat & moderation (was Phase 9)
- [x] Emote bar (12 text emotes, a soft pop each). Voice lines play from `public/sounds/voice/<id>.webm` once recorded and listed in `VOICE_CLIPS` (`components/chat/chat-dock.tsx`).
- [x] Text chat (private + public, host switch in the lobby, "Chat in public games" setting), obscenity + Naija list, links refused, phone numbers masked, HMAC-signed lines; chat in tournament lobbies. Nothing stored.
- [x] Mute (this game) / Block / Report… from a name in chat; 5 starred lines in 2 min → 5 min mute in that room; 3 reporters in 24 h → 24 h account chat mute (migration `0006_moderation`).
- [x] `/admin`: report queue cards (verified line, history), Dismiss / Warn (notice on Home) / Mute / Ban / Unban / Unmute, user lookup; a ban closes presence, room and tournament sockets with 4010 and tickets are refused from then on. Trade logs for property gifting: dropped, the property game is unranked so gifting wins nothing.
- Designed with Best (Oct 17 2026, mockups): round chat button bottom right + sheet + 3 s bubbles, tap a name for Mute/Block/Report, text emotes now and clips later, report queue cards.

**Exit:** E2E report → ban → banned user disconnected and can't get tickets.
Met (Oct 2026): E2E "chat: an insult is starred, reported with the line, and a ban throws the sender out" (B lands on /banned from the open room, and going back to the room ends on /banned again); DO tests for cleaning, signing, links, blocking, muting, the host switch, forged report lines and the ban kick.

## Phase 16 — Polish & launch (was Phase 10)
- [ ] PWA (manifest, icons, Serwist precache incl. every game chunk and sprite after first visit, offline page).
- [ ] Capacity guard (`CAPACITY` error, matchmaker soft limit, tournament host warning wired to the `Quota` DO), email quota UX.
- [ ] Accessibility pass for **every** game: keyboard play (chess/draughts move entry, property actions, football picks), screen-reader labels and live announcements, focus rings.
- [ ] Performance pass on a real low-end Android for every game; budgets green (incl. new game chunks); CPU benchmark green for every game, measured on Cloudflare (bench Worker, moved here from Phase 7).
- [ ] Final copy review (plain, Nigerian-English friendly); credits page (Cburnett, Stockfish, data sources); football disclaimer.
- [ ] Soft launch with friends; watch the Cloudflare and Vercel usage numbers manually for a week.

**Exit:** all success criteria in `00-overview.md` met.
