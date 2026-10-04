# GameHub — documentation

Free, web-only, Nigeria-first multiplayer games: Whot, Ludo, Snakes & Ladders, Tic-tac-toe, Rock Paper Scissors.

Start with **`AGENTS.md`** (rules for anyone — human or AI — writing code), then `docs/00-overview.md`.

```
AGENTS.md
docs/
  00-overview.md            product decisions, success criteria
  01-architecture.md        monorepo, deployables, flows, regions
  02-tech-stack.md          libraries and why
  03-realtime-protocol.md   every WebSocket message, tickets, limits
  04-reconnection.md        seat states, grace, bots, client/server code
  05-durable-objects.md     Worker, GameRoom/Matchmaker/Presence, storage
  06-auth.md                Better Auth, 18+ gate, Nodemailer + Gmail
  07-database.md            Drizzle schema, queries
  08-matchmaking-ratings.md private rooms, quick-match, openskill, leaderboards, spectating, friends
  09-chat-moderation.md     emotes, voice lines, chat, reports, admin
  10-performance.md         budgets, rendering, latency hiding, PWA
  11-design-system.md       colours, type, motion, components, copy
  12-testing.md             unit, property, DO, E2E
  13-free-tier-budget.md    limits and capacity maths
  14-security.md            fair play, headers, secrets, privacy
  phases.md                 build order with exit criteria
  concerns.md               risks and triggers
  games/
    engine-contract.md
    whot.md  ludo.md  snakes-and-ladders.md  tic-tac-toe.md  rock-paper-scissors.md
```

Copy this folder into the root of the `gamehub` repo. Claude Code reads `AGENTS.md` automatically if you also add a `CLAUDE.md` containing `@AGENTS.md`.

## Develop

Node 24 and pnpm 12 (`corepack enable`).

```bash
pnpm i
cp .env.example packages/db/.env                  # add DATABASE_URL (Neon)
cp apps/realtime/.dev.vars.example apps/realtime/.dev.vars
pnpm dev                                          # web :3000, realtime :8787
pnpm lint && pnpm typecheck && pnpm test
pnpm build && pnpm budget                         # first-load JS budget
pnpm exec lhci autorun                            # Lighthouse mobile (needs Chrome; set CHROME_PATH if not found)
```
