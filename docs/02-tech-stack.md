# 02 — Tech stack

Versions: pin exact versions in `package.json` at project start; check npm for the latest at that time. Notes below reflect state as of October 2026.

| Concern | Choice | Why | Notes |
|---|---|---|---|
| Package manager | pnpm | Fast, strict, workspace support | `packageManager` field pinned |
| Monorepo tasks | Turborepo | Caching, task graph | Remote cache not needed |
| Web framework | Next.js 16.x | App Router, Cache Components (`"use cache"`), React Compiler stable, Turbopack default | Node 20.9+ required |
| Hosting (web) | Vercel Hobby | Free, no card | Personal/non-commercial use — fits a free project |
| Styling | Tailwind v4 | Zero-runtime CSS, tokens via `@theme` | |
| Components | shadcn/ui | Copy-in, tree-shakeable | Only add what you use |
| Icons | lucide-react | Per-icon imports | Never import the barrel |
| Client state | Zustand | Tiny, no provider | One store per game screen |
| Server data | TanStack Query | Cache + refetch for HTTP | Not used for WS state |
| Realtime runtime | Cloudflare Workers + Durable Objects (SQLite) | WebSockets + per-room actor, free plan, no card | Use Hibernation API always |
| Realtime framework | `partyserver` | Rooms, routing, hibernation, per-connection state, built by Cloudflare | `static options = { hibernate: true }` |
| WS client | `partysocket` | Auto-reconnect with backoff, message buffering, React hooks | Async `query` for fresh tickets |
| Auth | Better Auth | Email verify, reset, Google, Drizzle adapter | Your usual stack |
| Email | Nodemailer + Gmail SMTP | Free, no card | 500 recipients / rolling 24 h; App Password needs 2-Step Verification |
| DB | Neon Postgres Free | 0.5 GB, 100 CU-h/month, no card | `@neondatabase/serverless` HTTP driver |
| ORM | Drizzle | Types, migrations | `drizzle-orm/neon-http` |
| Validation | Zod | Shared schemas | |
| JWT | `jose` | Works in Workers and Node | HS256 tickets |
| Ratings | `openskill` (JS) | Multiplayer free-for-all ratings (Weng-Lin), better fit than Elo for 2–8 players | Plackett-Luce model |
| Profanity | `obscenity` | Catches obfuscated variants, extensible word lists | Add Naija list |
| Human check | Cloudflare Turnstile | Free, no card | Signup + password reset forms |
| PWA | Serwist | Service worker precache | Verify Turbopack support at setup; fall back to a hand-written SW if needed |
| Motion | CSS transitions/WAAPI | No motion library on first load | `motion` only lazy in game routes if really needed |
| Unit tests | Vitest + fast-check | Property tests for rules | |
| DO tests | `@cloudflare/vitest-pool-workers` | Runs DOs in workerd | |
| E2E | Playwright | Multi-context games, offline simulation | Mailpit locally for emails |
| Chess rules | **chess.js 1.4.0** (BSD-2-Clause) | Mature legality/SAN/FEN/PGN, pure and deterministic (fixed-seed Zobrist) | Inside `packages/engine`; our own draw/repetition counters on top. Verify at install |
| Chess board UI | Our own SVG board | Small, our design, no GPL | **Not** chessground |
| Chess pieces | **Cburnett** set from Wikimedia Commons, used under its **BSD 3-clause** option (also GFDL/CC BY-SA/GPL) | Classic, readable on small screens | Credit on `/legal/credits`; fallback set: `rhosgfx` (CC0) |
| Strong chess bot | **Stockfish 19** via npm `stockfish` 19.0.0 (GPL-3.0), **lite single-threaded** WASM (≈ 1.8 MB) | Strong, adjustable (`UCI_LimitStrength`, `UCI_Elo` 1320–3190, `Skill Level`, `movetime`) | **Server only** (Vercel bot service). Never in the browser |
| Easy chess bot | Our own TypeScript searcher (MIT, ours) | Runs inside the DO's CPU limit (node budget) | — |
| Draughts engine + bots | Our own TypeScript (MIT, ours) | No suitable permissive library for Naija rules; majority-capture/flying kings are small to implement | Hard level also runs in the bot service |
| Football data | `@gamehub/football-data` (ours) | Versioned JSON + Zod | Built in its own phase |

## Things deliberately NOT used

| Not used | Reason |
|---|---|
| Socket.IO | Extra protocol overhead and fallbacks we don't need |
| Colyseus | Needs a long-running Node server → no free no-card home |
| Phaser / PixiJS | Too heavy for card/board games; SVG + CSS is enough |
| Redis / Upstash | DOs already serialize per room |
| Inngest / queues | Not needed; email sent inline with `after()` |
| Resend | Your choice: Nodemailer + Gmail |
| Sentry / PostHog | Your choice: no monitoring |
| chessground | GPL-3.0 — would put GPL code in the browser bundle (`AGENTS.md` §1) |
| chessops / scalachess / lichess board assets under GPL/AGPL or CC BY-NC-SA | GPL family in the browser, or non-commercial-only licences |
| Stockfish in the browser | GPL in the client; also 1.8–99 MB downloads on phones |
| EA FC / FIFA / SoFIFA / FUTBIN data | Copying ratings/databases is a legal risk; our ratings are our own |
| Transfermarkt bulk imports (incl. `transfermarkt-datasets`) | Database rights unclear; data paused since July 2026 — research aid only |
