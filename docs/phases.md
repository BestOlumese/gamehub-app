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
- [ ] Better Auth with Drizzle adapter; email+password with required verification; Google.
- [ ] Nodemailer + Gmail SMTP, templates, `email_log` quota guard (480/24 h), resend cooldowns.
- [ ] Sign-up (DOB 18+ gate, Turnstile), login, verify-email page, forgot/reset password, change password/email, delete account.
- [ ] Onboarding: DOB for Google users, username picker (profanity + reserved names).
- [ ] Middleware: verified + adult + username required for app routes; bans.
- [ ] Legal pages: terms, privacy.
- [ ] E2E: sign-up/verify/reset flows with Mailpit.

**Exit:** a new user can sign up with email or Google and reach `/home`; under-18 refused; all auth E2E green.

## Phase 2 — Realtime core + Tic-tac-toe
- [ ] `protocol`: envelopes, room messages, tickets, close codes.
- [ ] Ticket endpoint + Worker verification (`jose`), Origin checks.
- [ ] `GameRoom` DO: lobby, seats, start, action loop, single-row persistence, single-alarm deadline scheduler, per-seat views, idempotency, rate limits.
- [ ] Engine contract + seeded RNG + **Tic-tac-toe** (rules, bots, tests).
- [ ] Private room create/join (code, WhatsApp share, `/r/<code>`), lobby UI, game screen shell.
- [ ] partysocket client with fresh tickets, reconnection UI, seat states, grace → bot, turn timers.
- [ ] DO tests incl. hibernation and rows-written ≤ 2.

**Exit:** two phones on mobile data play a TTT series; toggling airplane mode for 10 s and 70 s behaves exactly as `04-reconnection.md` says.

## Phase 3 — Rock Paper Scissors
- [ ] Simultaneous hidden picks, duel + knockout bracket, bots, tests.
- [ ] Bracket UI and spectator view for eliminated players.

**Exit:** 8-player RPS knockout with 5 bots completes; no pick leaks before reveal (test).

## Phase 4 — Whot
- [ ] Full rules engine from `games/whot.md` with every option; bots (3 levels); property tests (54-card conservation, no leaks).
- [ ] Rules sheet UI for all options with "Naija Standard" reset.
- [ ] Card sprite, hand/pile/market UI, shape picker, LAST CARD button, penalty indicators, sounds.

**Exit:** 4-player game (2 humans, 2 bots) to the end on low-end Android with no jank; all Whot tests green.

## Phase 5 — Ludo
- [ ] Engine from `games/ludo.md`, bots, tests.
- [ ] SVG board, seed movement with hop animation, die, auto-move for single legal move.

**Exit:** 4-player Ludo game completes; reconnect mid-move works; rows written per game within budget estimate.

## Phase 6 — Snakes & Ladders
- [ ] Engine, classic board (verified), 3 designed presets passing the simulation test.
- [ ] Data-driven SVG board, 8 tokens.

**Exit:** 8-player game completes; presets pass simulation.

## Phase 7 — Quick-match, ratings, history
- [ ] `Matchmaker` DO with FIFO, 20 s bot-fill (unranked) + "keep waiting" option.
- [ ] Signed match-result ingest, `match`/`match_player`/`user_stats`/`rating`, openskill updates, pair-farming cap.
- [ ] Profile page: stats, ratings, last 20 matches.
- [ ] Leaderboards: weekly + all-time per game, cached + tag revalidation.

**Exit:** two accounts quick-match, finish a ranked game, both see rating changes and leaderboard entries.

## Phase 8 — Friends, presence, invites, spectating
- [ ] `Presence` DO (socket tags), friend requests/accept/block, online + in-game status.
- [ ] Invites to rooms (toast), watch a friend's game, spectator mode with limits.

**Exit:** friend A invites B from the friends list; B joins in two taps; C spectates without seeing hands.

## Phase 9 — Chat & moderation
- [ ] Emote bar + voice lines (record your clips).
- [ ] Text chat (private + public, per-user toggle), obscenity + Naija list, link/phone masking, signed messages.
- [ ] Mute/block/report, auto chat-mute rules.
- [ ] `/admin`: report queue, actions, ban flow closing sockets.

**Exit:** E2E report → ban → banned user disconnected and can't get tickets.

## Phase 10 — Polish & launch
- [ ] PWA (manifest, icons, Serwist precache, offline page).
- [ ] Capacity guard (`CAPACITY` error, matchmaker soft limit), email quota UX.
- [ ] Accessibility pass (keyboard play for all games, screen-reader labels for cards/seeds, focus rings).
- [ ] Performance pass on a real low-end Android; budgets green.
- [ ] Final copy review (plain, Nigerian-English friendly).
- [ ] Soft launch with friends; watch Cloudflare dashboard daily usage numbers manually for a week.

**Exit:** all success criteria in `00-overview.md` met.
