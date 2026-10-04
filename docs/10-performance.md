# 10 — Performance

Target users: mid/low-end Android phones on 4G that sometimes drops. Optimise for **slow CPUs and unstable connections**, not just bandwidth.

## Budgets (enforced in CI)

| Route group | First-load JS (gzip) | LCP (Moto G Power, slow 4G) | Lighthouse mobile |
|---|---|---|---|
| Marketing: `/`, `/games`, `/games/[slug]`, `/legal/*` | ≤ 145 KB | ≤ 1.8 s | Perf ≥ 95, A11y/BP/SEO 100 |
| App shell: `/home`, `/profile/[u]`, `/leaderboards`, `/friends` | ≤ 195 KB | ≤ 2.2 s | Perf ≥ 90 |
| Game: `/play/[roomId]` | ≤ 195 KB shell + ≤ 60 KB per game chunk | interactive ≤ 2.5 s | Perf ≥ 85 |

Budgets are total first-load JS, including the React + Next.js runtime that every App Router page loads (≈ 134 KB gzip on Next 16.3 / React 19.3, measured October 2026). Budgets were raised by that floor in Phase 0; the Lighthouse targets are unchanged and remain the hard gate.

Checks:
- `scripts/check-bundle-budget.mjs` (`pnpm budget`) starts the built app, gzips every `<script src>` each route loads (ignoring `nomodule` polyfills) plus inline scripts, and fails CI if a route exceeds its budget.
- Lighthouse CI (GitHub Actions, free) on preview deployments with the mobile preset, 3 runs, median.

Lighthouse measures page loads; gameplay smoothness is covered by INP and frame checks below.

## Rendering strategy

| Page | Strategy |
|---|---|
| Landing, game info pages, legal | Static, fully cached (`"use cache"`), zero client JS except the sign-in button island |
| Leaderboards | Cached component, `cacheLife("minutes")`, tag-revalidated on match ingest |
| Profile | Cached per user (tag `profile:<id>`), dynamic "online" badge streamed in |
| Home/lobby (logged in) | Static shell + small client islands (friends online, quick-match buttons) |
| Game | Client-heavy; game code split per game with `next/dynamic` |

- Server Components by default; `"use client"` only at leaves.
- React Compiler on — no manual `useMemo` sprinkling.
- `next/font` with **one** variable font family for UI + one display font, subsetted (Latin), `display: swap`.
- No images on marketing pages except one optimised hero SVG; all game art is SVG.

## Game client

- Boards, cards, dice are **SVG + CSS transforms**. No canvas engine.
- Animate only `transform` and `opacity`. Use WAAPI/CSS; no motion library in the initial game chunk.
- Card art: one SVG sprite per game (`<symbol>` + `<use>`), ≤ 25 KB gz for the whole Whot deck.
- Zustand store per room; components subscribe with selectors so a move re-renders only the changed pieces.
- WebSocket message handling: parse + validate + set state in one `startTransition`-free synchronous step (messages are tiny); animations driven by `event` messages queued and played sequentially.
- Respect `prefers-reduced-motion` and the user's setting (shorter, no bounce).
- Sound: lazy-load after first interaction; sprites ≤ 60 KB total.

### Hiding latency (rooms run in Europe, ~100–150 ms from Lagos)
- Optimistic UI: the client applies its own action with the shared engine immediately (card flies to pile, seed starts moving) and reconciles on the server snapshot.
- Dice: start the 600 ms roll animation on tap; the real value arrives well before the animation ends.
- Never optimistic for hidden info (drawing from Whot market waits for the server — show a card-flip placeholder).

## PWA

- Installable manifest (name "GameHub", theme colour = brand green, icons 192/512 maskable).
- Service worker (Serwist): precache app shell, fonts, game sprites, sounds; network-first for HTML; never cache `/api/*` or `/admin/*`.
- Offline page: "You're offline. Your game seat is held for 60 seconds — we'll reconnect when you're back."
- Repeat visits should start a game screen with near-zero network (only the WS connection).

## Network hygiene

- One WS connection per page purpose (presence on app pages, room on game page — presence socket closed while in a game to save requests; room DO tells Presence the user is `inGame`).
- No polling anywhere.
- HTTP: TanStack Query with `staleTime` ≥ 30 s for profiles/leaderboards.

## Device checks (manual, each release)

- A low-end Android (e.g. 2–3 GB RAM device) on Chrome: full Whot 4p game, no jank > 100 ms during card plays (Chrome DevTools performance trace).
- Throttled "Slow 4G" + toggling offline mid-game: reconnect works.
- INP ≤ 200 ms on all interactions.
