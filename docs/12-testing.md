# 12 — Testing

Chosen depth: **engine unit + property tests; E2E for key flows.** Plus a thin layer of Durable Object tests, because reconnection and hibernation are where bugs hide.

## 1. Engine (Vitest + fast-check) — `packages/engine`

Must reach ~100 % branch coverage of rule code.

Per game:
- **Example tests** for every rule in the game doc (one test per row of the special-cards / options tables, both with the option on and off).
- **Property tests** (fast-check), ≥ 1,000 runs each:
  - Random rule config (from `ruleSchema` arbitrary) + random seed + random legal actions until over → invariants hold after every step.
  - Termination: game ends within a bound (Whot ≤ 2,000 actions, Ludo ≤ 5,000, Snakes ≤ 3,000, RPS ≤ 500, TTT ≤ 80: best of 5 + 3 sudden-death rounds).
  - Every action outside `legalActions` is rejected; `apply` never throws.
  - `view(s, k)` never contains another seat's private data (serialise and search for card ids).
  - Determinism: same seed + same actions ⇒ identical states.
- **Bot tests**: bots only return legal actions; Hard TTT never loses (exhaustive); Hard bots beat Easy bots > 60 % over 1,000 simulated games (Whot, Ludo).
- **Snakes presets**: simulation test from `games/snakes-and-ladders.md`.

```ts
// example property test shape
test.prop([fc.record({ seed: fc.uint8Array({ minLength: 16, maxLength: 16 }), players: fc.integer({ min: 2, max: 8 }), rules: whotRulesArb })])(
  "whot conserves 54 cards", ({ seed, players, rules }) => {
    let s = whot.setup(players, ctx(seed, rules));
    for (let i = 0; i < 2000 && !whot.isOver(s); i++) {
      const seat = whot.currentSeats(s)[0]!;
      const acts = whot.legalActions(s, seat, rules);
      const r = whot.apply(s, { seat, action: pick(acts, i) }, ctx(seed, rules));
      expect(r.ok).toBe(true); if (!r.ok) return;
      s = r.state;
      expect(countCards(s)).toBe(54);
    }
  });
```

## 2. Protocol — `packages/protocol`
- Schema round-trip tests; reject oversized/invalid payloads.

## 3. Durable Objects — `@cloudflare/vitest-pool-workers`
- Ticket verification: bad/expired/wrong-scope tickets rejected; bad Origin rejected.
- Full game via two in-test WebSocket clients (TTT).
- Hibernation: force eviction between moves → state identical after reload.
- Alarms: turn timeout triggers timeout action; grace → bot; multiple deadlines share one alarm; `setAlarm` only called when the earliest deadline changes (spy).
- Rows-written count per action ≤ 2 (spy on storage) — guards the free-tier budget.
- Duplicate action id → no double apply.
- Spectator never receives a hand.

## 4. Web — Vitest
- Match ingest: signature/timestamp checks, idempotency, rating update maths, unranked path.
- Email quota guard stops at 480.
- Age gate maths (birthdays on leap days, today = 18th birthday → allowed).

## 5. E2E — Playwright (key flows)

Run against `next start` + `wrangler dev` + local Postgres (Docker) + **Mailpit** as SMTP sink (set SMTP env to Mailpit in test env).

| Flow | Notes |
|---|---|
| Sign up → verification email (read from Mailpit API) → click link → onboarding (username) → home | |
| Under-18 DOB is refused | |
| Forgot password → email → reset → login | |
| Google sign-in | Mock in test env (skip real Google) |
| Create private room → second browser context joins via code → play TTT to the end | |
| Whot 3 players (3 contexts) quick game with small `handSize` | Checks hidden hands across contexts |
| Disconnect 10 s (`context.setOffline`) → reconnect same seat | |
| Disconnect 70 s → bot plays → reconnect → regain control | Use a short grace in test config |
| Second tab same user → first tab shows "Opened in another tab" | |
| Quick-match 2 players → ranked result → rating changes on profile | |
| Chat: profanity censored; report → appears in admin queue → ban → banned user's socket closed | |

## CI (GitHub Actions, free for public repos / limited minutes private)
1. `pnpm lint && pnpm typecheck`
2. `pnpm test` (engine, protocol, web unit, DO tests)
3. Build + bundle budget check
4. E2E (Playwright, Chromium only, mobile viewport)
5. Lighthouse CI on Vercel preview URL

## As built (Phase 2)

- Playwright starts `next start` (:3000) **and** `wrangler dev` (:8787, `GRACE_MS=3000`) itself; CI writes throwaway secrets to `apps/realtime/.dev.vars`.
- Disconnects are simulated by **closing the browser context** and reopening it with the saved login: Chromium's offline emulation does not close WebSockets that are already open.
- DO tests shorten the grace with the `GRACE_MS` binding and fire alarms with `runDurableObjectAlarm`.
