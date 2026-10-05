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

### Workers Free (the router Worker)
- Worker requests are also capped daily on Free (check current figure, historically 100k/day). Every WS upgrade passes through the Worker once.

### Neon Free
- 0.5 GB storage per project, 100 CU-hours/month, scale-to-zero after 5 min (cold start on next query ~sub-second).

### Vercel Hobby
- Generous function invocations and bandwidth for our size; cron limited — we don't rely on cron.

### Gmail SMTP
- 500 recipients per rolling 24 h. Exceeding returns `550 5.4.5` and can block sending for up to 24 h.

## The binding constraint: rows written

Per move we write **~1–2 rows**: 1 state upsert, plus 1 `setAlarm` only when the alarm must ring earlier (bot think times; a later turn clock reuses the alarm already set). Chat, emotes, presence: **0 writes** (kept in memory / socket attachments).

| Game | Typical actions per game | Rows written / game (≈2×) | Games/day within 100k |
|---|---|---|---|
| Tic-tac-toe (best of 3) | ~20 | ~40 | ~2,500 |
| RPS knockout 8p | ~40 | ~80 | ~1,250 |
| Snakes & Ladders 4p | ~120 | ~240 | ~400 |
| Whot 4p | ~120 | ~240 | ~400 |
| Ludo 4p | ~1,300 (measured: rolls waiting for 6s add up) | ~900–1,050 (chained turns + lazy alarm; measured 1,056 for 4 bots) | ~100 |

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
