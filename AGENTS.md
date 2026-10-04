# AGENTS.md — GameHub

You are working on **GameHub**, a free-to-play, Nigeria-first, web-only multiplayer game platform.
Players (2–8 per room, depending on the game) play **Whot, Ludo, Snakes & Ladders, Tic-tac-toe and Rock Paper Scissors** in real time over WebSockets.

Read this file fully before writing code. Then read the doc(s) for the area you are touching.

---

## 1. Non-negotiables

1. **Free forever, no credit card.** Everything must run on: Vercel Hobby, Cloudflare Workers Free (Durable Objects, SQLite-backed), Neon Free, Gmail SMTP. Never add a dependency or service that needs a paid plan or a card. See `docs/13-free-tier-budget.md`.
2. **No monetization.** No ads, coins, purchases, staking, or prizes. Do not add hooks "for later".
3. **Server is the source of truth.** Clients send *intents*; the Durable Object validates with the shared engine and broadcasts results. Never trust client state, dice, shuffles, or timers.
4. **Hidden information never leaves the server.** A Whot client only ever receives its own hand. Spectators receive no hands. See `docs/14-security.md`.
5. **Engine is pure.** `packages/engine` has zero I/O, zero `Date.now()`, zero `Math.random()`. Randomness and time are injected.
6. **Every game rule is configurable** through a typed `RuleConfig` with a "Naija Standard" preset. No hard-coded house rules.
7. **Performance budgets are tests, not wishes.** See `docs/10-performance.md`. A PR that breaks a budget is not done.
8. **18+ only.** Signup requires date-of-birth confirmation of 18+. We store only the confirmation timestamp, not the DOB.
9. **Light theme only.** Follow `docs/11-design-system.md`. No generic AI-looking UI, no AI-sounding copy.
10. **English only** for UI copy.

## 2. Stack (locked)

| Area | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 16 (App Router, Cache Components, React Compiler, Turbopack) on Vercel Hobby |
| Styling | Tailwind CSS v4 + shadcn/ui (only the components we use) |
| Client state | Zustand (game/session UI state), TanStack Query (HTTP data) |
| Realtime | Cloudflare Workers + Durable Objects (SQLite-backed) via **PartyServer**; client uses **partysocket** |
| Auth | Better Auth (email+password with mandatory email verification, Google OAuth, password reset) |
| Email | Nodemailer over Gmail SMTP (App Password) |
| DB | Neon Postgres (Free) + Drizzle ORM |
| Validation | Zod (shared in `packages/protocol`) |
| Ratings | openskill (Weng-Lin, multiplayer) |
| Profanity | obscenity + custom Naija word list |
| Bot protection | Cloudflare Turnstile on signup |
| Tests | Vitest + fast-check (engine), @cloudflare/vitest-pool-workers (DOs), Playwright (E2E) |

No monitoring/analytics SDKs (decision: not needed).

## 3. Repo layout

```
gamehub/
├─ AGENTS.md
├─ docs/                      ← all specs (this folder)
├─ apps/
│  ├─ web/                    Next.js app (Vercel)
│  └─ realtime/               Cloudflare Worker + Durable Objects
├─ packages/
│  ├─ engine/                 pure game rules + bots (no I/O)
│  ├─ protocol/               zod schemas for every WS message + shared types
│  ├─ db/                     Drizzle schema, migrations, queries
│  ├─ ui/                     shared React components + design tokens
│  └─ config/                 tsconfig, eslint, tailwind presets
```

Dependency direction: `web → protocol, engine (client-side preview only), db, ui` · `realtime → protocol, engine` · `engine → nothing` · `protocol → engine (types only)`.
**`realtime` never imports `db`.** It reports results to `web` over a signed internal HTTP call.

## 4. Docs map

| Touching… | Read |
|---|---|
| Anything | `docs/00-overview.md`, `docs/01-architecture.md` |
| Libraries/versions | `docs/02-tech-stack.md` |
| WebSocket messages | `docs/03-realtime-protocol.md` |
| Disconnects/bots taking over | `docs/04-reconnection.md` |
| Worker / Durable Objects | `docs/05-durable-objects.md` |
| Login, signup, email | `docs/06-auth.md` |
| Tables, queries | `docs/07-database.md` |
| Quick-match, ratings, leaderboards | `docs/08-matchmaking-ratings.md` |
| Chat, emotes, reports, admin | `docs/09-chat-moderation.md` |
| Bundle size, Lighthouse, PWA | `docs/10-performance.md` |
| UI, colours, components | `docs/11-design-system.md` |
| Tests | `docs/12-testing.md` |
| Free tier limits | `docs/13-free-tier-budget.md` |
| Anti-cheat, rate limits | `docs/14-security.md` |
| A specific game | `docs/games/engine-contract.md` + `docs/games/<game>.md` |
| What to build next | `docs/phases.md` |
| Known risks | `docs/concerns.md` |

## 5. Coding conventions

- TypeScript `strict`, `noUncheckedIndexedAccess`. No `any`; use `unknown` + zod.
- Server Components by default; `"use client"` only at leaves that need interactivity.
- Every WS message type is defined once in `packages/protocol` and validated on **both** ends.
- Engine functions: `(state, action, ctx) => Result<State, RuleError>`; never throw for rule violations.
- File names: kebab-case. Components: PascalCase exports. One component per file in `ui`.
- Copy: short, plain, Nigerian-English friendly ("Your turn", "Pick 2!", "General market!"). No exclamation spam, no emoji in UI chrome.
- Commits: Conventional Commits (`feat(whot): …`).

## 6. Commands

```bash
pnpm i
pnpm dev                 # web (3000) + realtime (wrangler dev, 8787)
pnpm test                # vitest across packages
pnpm test:e2e            # playwright
pnpm lint && pnpm typecheck
pnpm --filter db generate && pnpm --filter db migrate
pnpm --filter realtime deploy
```

## 7. Definition of done

- Types pass, lint passes, unit + property tests pass, relevant E2E passes.
- No new client JS on marketing routes beyond budget.
- Free-tier write/request cost of any new realtime feature estimated in the PR (see `docs/13-free-tier-budget.md`).
- Docs updated if behaviour or a rule changed.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
