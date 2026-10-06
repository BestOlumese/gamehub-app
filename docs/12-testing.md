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

## New games and modes (Phase 7 onward)

### Chess
- **Perft** on our wrapper and on the Easy-bot move generator: start position depth 1–4 = 20 / 400 / 8,902 / 197,281; "Kiwipete" depth 1–3 = 48 / 2,039 / 97,862; positions 3–6 from the Chess Programming Wiki perft list (verify numbers when writing the test). Both generators must agree node for node.
- Draw-rule table tests (auto and claim modes), clock maths (lag quota, increment, flag grace), abort, takebacks, draw-offer limits; properties (random games end, determinism, illegal moves rejected).
- Bot-service fallback with mocked fetch (timeout, 429, illegal move).

### Draughts
- Capture edge cases: flying-king captures with several landing squares, majority vs free choice, Turkish strike blocking, passing through the crowning row mid-capture, English man reaching the king row mid-jump (move ends), men capturing backward on/off, huffing flow.
- Promotion edge cases; draw rules (25-move, 16/5-move endgames, 40-move English, threefold).
- Move-generation cross-check against a slow reference generator on 1,000 random positions per variant.
- Hard (bot service, short budget in tests) beats Easy > 60 %.

### Property game
- **Money conservation** (`Σ cash + jackpot + bankOut − bankIn = startCash × players`) and **building supply conservation** after every action (property tests, ≥ 1,000 runs, all rule options random).
- No deck order in any view; trades atomic; auctions resolve correctly with resets; bankruptcy to player vs bank.
- **Monte Carlo balance** (10,000 games per player count, Medium bots): classic length, group win-rate spread (≤ 2×), first-player advantage (± 3 points), money-supply band (`games/property.md`). Runs nightly / on demand in CI (not on every push — it's slow).

### Football Draft
- **Draft distribution test:** 10,000 auto-drafted teams per luck preset → p10/median/p90/max of team rating and share with a Legend within the bands in `football-draft/draft.md`; no duplicates in a set; legend cap; floor and captain guarantees.
- **Match engine Monte Carlo:** 10,000 matches → goals, draws, shots, possession, cards, win-probability-by-rating-gap bands (`football-draft/match-engine.md`); determinism.
- **Hidden info:** no view ever contains another manager's option set or picks before kickoff (serialise and search for player ids).
- Data package: validator unit tests; the sample file passes the validator.

### Tournaments
- Bracket property tests (≥ 1,000 runs, 4–32 entrants, random valid stages): each entrant placed once; nobody at two tables at once; table sizes within limits and differing by ≤ 1; byes only in 1v1 stages, fewest-byes first; 1v1 rounds powers of two after byes; one champion.
- DO tests: create → seed → RPC tables → reports advance players → final result posted once (idempotent) → duplicate reports ignored; a disconnected entrant's bot advances.
- E2E: 4 humans + 4 bots, Whot stage then RPS stage, auto-navigation to tables and back.

### Bot service
- HMAC rejection paths, schema limits, legal moves for 50 FENs, `movetime` respected, `BUSY` queue, per-instance CPU backstop, `Quota` DO accounting.
- Build check: no Stockfish file under `.next/static`.

### CPU benchmark (Free plan's 10 ms)
- Test-only route (below) exercised in CI against `wrangler dev`, plus a production spot-check once per phase.
