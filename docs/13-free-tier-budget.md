# 13 — Free-tier budget

Everything must fit these. Numbers checked October 2026 — re-check the providers' pages before launch.

## Limits

### Cloudflare Workers Free — Durable Objects (SQLite-backed only)
| Metric | Free limit | Resets |
|---|---|---|
| DO requests (HTTP, RPC, **WS connects**, **alarms**, incoming WS messages ÷ 20) | 100,000 / day | 00:00 UTC (01:00 Lagos) |
| DO duration | 13,000 GB-s / day (≈ 28.9 active hours at 128 MB) | 00:00 UTC |
| SQLite rows read | 5,000,000 / day | 00:00 UTC |
| SQLite rows written (each `setAlarm` = 1 row; deletes count) | **100,000 / day** | 00:00 UTC |
| Storage | 5 GB total account | — |
| Outgoing WS messages | Free, unmetered | — |

**When a free limit is exceeded, further operations of that type fail with an error until reset.** There is no overage billing on Free — the app just breaks for that metric. We must degrade gracefully (see below).

### CPU time per invocation — confirmed October 2026
| Fact | Value | Source |
|---|---|---|
| Workers Free CPU per request | **10 ms** | Workers limits page |
| Durable Objects | "the **same per invocation CPU limits** as any Workers" | DO FAQ |
| DO limits page footnote | "30 seconds (default)" CPU per request, reset by each incoming request/WebSocket message | DO limits page — **conflicts** with the line above |
| What counts | Active CPU only; waiting on `fetch`, storage or other I/O does **not** count | Workers limits, DO FAQ |
| Start-up (global scope) | ≤ **1 s** to parse/execute at deploy; field reports show cold-start work also counting against the **first invocation's 10 ms** on Free | Changelog 2025-10-10; GitHub issue (emdash #3858) |

**Decision:** design for **10 ms per invocation** (the stricter, plan-specific figure; the DO FAQ ties DOs to the Workers plan limit, and the 30 s footnote reads as the Paid default). Target **≤ 5 ms typical**, ≤ 8 ms worst case, per WebSocket message, HTTP request or alarm. Exceeding it on Free terminates the invocation (the action fails and the client gets a reconnect/snapshot).

**Benchmark (Proposal):** `GET /__bench?game=<slug>&n=<actions>` — compiled only when `BENCH=1` (never in production config). It replays a recorded game (seeded) action by action, **one action per request** (so each is its own invocation), and the CI script reads each invocation's `cpuTime` from `wrangler tail --format json` / Workers Logs (enable observability for the benchmark deploy only; ⚠️ verify the field name). `Date.now()`/`performance.now()` can't measure CPU inside a Worker (they only advance on I/O). Report p50/p95/max per game into the PR; fail if p95 > 5 ms or max > 8 ms. Proxy in unit tests: the same replay under Node with a 3× safety factor.

### Worker size — changed 4 September 2026
**64 MiB uncompressed on all plans; no compressed limit** (was 3 MB compressed on Free). The football dataset (~110–140 KB raw, ~35–45 KB gzip, estimate), chess.js and our engines fit easily. Size still costs **start-up CPU**, so: keep the realtime bundle lean, parse the football data lazily on first use per isolate, and store it as compact tuples.

### Workers Free (the router Worker)
- Worker requests are also capped daily on Free (100k/day). Every WS upgrade passes through the Worker once.

### Neon Free
- 0.5 GB storage per project, 100 CU-hours/month, scale-to-zero after 5 min (cold start on next query ~sub-second).

### Vercel Hobby (checked October 2026)
| Resource | Hobby included / month |
|---|---|
| Active CPU | **4 CPU-hours** (only executing code; I/O waits don't count) |
| Provisioned memory | 360 GB-hours |
| Function invocations | 1,000,000 |
| Max duration | 300 s (default and max) |
| Memory / CPU | 2 GB / 1 vCPU |
| Function size | 250 MB uncompressed |
Over a limit → **the account waits until 30 days have passed** (whole site affected). Non-commercial use only.

**Bot service budget:** at most **2 CPU-hours/month** (50 %) for bots → **240 CPU-s/day**, enforced by the `Quota` DO and a per-instance backstop (`15-bot-service.md`). ≈ 1,100 Hard chess moves or ≈ 2,000 Medium moves per day; beyond that the built-in engines play.

### Gmail SMTP
- 500 recipients per rolling 24 h. Exceeding returns `550 5.4.5` and can block sending for up to 24 h.

## The binding constraint: rows written

Per move we write **~1–2 rows**: 1 state upsert, plus 1 `setAlarm` only when the alarm must ring earlier (bot think times; a later turn clock reuses the alarm already set). Chat, emotes, presence: **0 writes** (kept in memory / socket attachments).

| Game | Typical actions per game | Rows written / game (≈2×) | Games/day within 100k |
|---|---|---|---|
| Tic-tac-toe (best of 3) | ~20 | ~40 | ~2,500 |
| RPS knockout 8p | ~40 | ~80 | ~1,250 |
| Snakes & Ladders 4p | ~130 | ~260 (chained bot turns; measured 424 for an 8-bot game of 254 actions) | ~380 |
| Whot 4p | ~120 | ~240 | ~400 |
| Ludo 4p | ~1,300 (measured: rolls waiting for 6s add up) | ~900–1,050 (chained turns + lazy alarm; measured 1,056 for 4 bots) | ~100 |
| Chess (≈ 80 plies) | ~80 | ~120–160 (flag-time alarm often moves earlier) | ~700 |
| Draughts (≈ 60–100 plies) | ~80 | ~100–150 | ~750 |
| Property 4p, 45 min | ~210 | ~250 (bot turns chained, bids not persisted) | ~400 |
| Property 8p, 45 min | ~300 | ~380 | ~260 |
| Football 1v1 (draft + match) | ~40 picks/arranges + 3 halves | ~20–25 (checkpointed picks) | ~4,000 |
| Football 8-manager league | ~160 picks + 7 rounds | ~100–110 | ~900 |
| Football solo run | ~20 picks + 4 matches | ~25–30 | ~3,500 |
| Tournament 32p, 4 stages (Whot → Ludo → Chess → Football) | — | ≈ 6,500 incl. all tables | ~15 (≈ 6.5 % of the day each) |

Requests: ~1 alarm per action + connects + messages/20 → roughly the same order as rows written, so requests (100k) bind at about the same point.

**Realistic mixed capacity: ~250–500 completed games per day** (Ludo is the heaviest: ~100/day if every game were 4-player Ludo). Fine for launch and early growth. Beyond that, Workers Paid ($5/month) is the upgrade path when you decide.

## Write-saving rules (mandatory)

1. Persist room state as **one row** (`state` JSON) — never per-field rows.
2. One combined write per accepted action (state + deadlines in the same row).
3. **One alarm per room**, always set to the earliest pending deadline (turn timer, disconnect grace, bot think time). Only call `setAlarm` when the earliest deadline actually changes.
4. Bots act inside the alarm handler and chain their moves in memory; persist once after a bot's full turn (e.g. Ludo roll+move = 1 write).
5. Chat/emotes are never written to storage.
6. Presence uses socket tags (`ctx.getWebSockets(tag)`), no storage.
7. On game end: one final write, then `deleteAll()` after results are acknowledged by `web` (frees storage; deletes count as writes, so it's 1–2 rows).
8. Lobby/waiting rooms don't set alarms until the game starts (except a 10-minute idle cleanup).

## Graceful degradation

- Worker catches storage/alarm quota errors → sends `{t:"error", code:"CAPACITY"}` → client shows: "GameHub is very busy today. New games open again at 1:00 AM." (00:00 UTC = 01:00 Lagos).
- Matchmaker refuses new rooms when a soft daily counter (kept in the PresenceDO, in memory with a periodic 1-write checkpoint) passes 90 % of estimated budget; in-progress games keep priority.
- Email: `web` keeps a daily send counter in Postgres; at 450 sends it stops non-critical emails (only verification + reset continue) and shows "Didn't get it? Try again in a few hours" on resend.

## PR rule

Any new realtime feature states its added rows-written and requests per game in the PR description.

### New features: requests
- Bot-service calls: per bot move 1 alarm + 2 `Quota` RPCs (requests) + 1 subrequest (`fetch`, not a DO request).
- Tournament: 2 RPCs per table (`initTable`, `reportTable`) + lobby socket messages ÷ 20.
- Football playback costs no requests (client-side timing); half starts are alarms.
