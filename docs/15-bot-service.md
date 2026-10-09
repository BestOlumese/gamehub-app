# 15 — Bot service (strong bots on Vercel)

Medium and Hard **chess** bots (Stockfish) and the Hard **draughts** bot need more CPU than a Durable Object may use on Workers Free (**10 ms per invocation**, `13-free-tier-budget.md`). They run in a small **Node function on Vercel Hobby**, called by the room DO with a signed request. Everything else (Easy chess, Easy/Medium draughts, all other games' bots) stays inside the DO.

Sources: `docs/research/sources.md` → "Platform limits", "Chess".

## Where it lives
- **Route handlers in `apps/web`**: `app/api/bots/chess/move/route.ts` and `app/api/bots/draughts/move/route.ts`, `export const runtime = "nodejs"`, `export const maxDuration = 10`, region `fra1` (same as the rest of `web`, ~same city as the DOs in `weur`).
- Stockfish files vendored in `apps/web/server/bots/stockfish/` (`stockfish-19-lite-single.js` ≈ 21 KB + `.wasm` ≈ 1.79 MB, plus `Copying.txt`), included in the function bundle with `outputFileTracingIncludes` (verify the Next.js 16 option name at install). Every bot module starts with `import "server-only"`.
- **Why not a separate Vercel project?** Hobby limits (Active CPU 4 h, invocations 1M) are **per account**, so a second project buys no extra quota; it would add a second deploy, secret set and domain. A separate project only helps isolate *failures* — we get that with the fallback below. Revisit if the bot route ever needs a different runtime or region.

## Endpoints

```ts
// packages/protocol/src/bots.ts
export const botMoveRequest = z.object({
  game: z.enum(["chess", "draughts"]),
  level: z.enum(["medium", "hard"]),
  position: z.string().max(200),          // chess: FEN; draughts: our compact position string
  history: z.array(z.string().max(12)).max(120).optional(), // moves since the last irreversible move (repetition awareness)
  movetimeMs: z.number().int().min(20).max(300),
  rules: z.unknown().optional(),          // draughts variant/options
  roomId: z.string().max(16),             // for logs/abuse limits only
});
export type BotMoveResponse =
  | { ok: true; move: string; cpuMs: number; engine: "stockfish-19-lite" | "gh-draughts-1" }
  | { ok: false; code: "BAD_REQUEST" | "UNAUTHORIZED" | "BUSY" | "QUOTA" | "ENGINE_ERROR" };
```

| Method + path | Body | Returns |
|---|---|---|
| `POST /api/bots/chess/move` | `botMoveRequest` with `game: "chess"` | `{ ok, move: "e7e8q" (UCI) }` |
| `POST /api/bots/draughts/move` | `game: "draughts"` | `{ ok, move: "28x19x10" }` |

## Auth (same HMAC scheme as other internal calls)
- `x-gh-ts` + `x-gh-sig` = HMAC-SHA256 over `${ts}.${body}` with `packages/protocol/src/hmac.ts` (`signBody` / `verifyBody`, constant-time, ±5 min window).
- **Separate secret `BOT_HMAC_SECRET`** (Wrangler + Vercel) so a leak can't be used to forge match results.
- Requests without a valid signature → `401` immediately (no engine work). Body ≤ 4 KB.
- The route is never called from browsers; CORS denies all origins.

## Stockfish in Node
```ts
// apps/web/server/bots/stockfish.ts (sketch — verify the loader API of the installed package)
import "server-only";
let engine: Promise<Uci> | null = null;     // module scope: reused while the instance is warm (Fluid compute)
const queue = new PQueue({ concurrency: 1 }); // single-threaded engine: one search at a time

export async function bestMove(fen: string, level: "medium" | "hard", movetimeMs: number) {
  if (queue.size >= 3) throw new BusyError();
  return queue.add(async () => {
    const uci = await (engine ??= start());  // loads stockfish-19-lite-single(.wasm), sends "uci", waits "uciok"
    await uci.send(`setoption name Threads value 1`);
    await uci.send(`setoption name Hash value 16`);
    await uci.send(`setoption name UCI_LimitStrength value true`);
    await uci.send(`setoption name UCI_Elo value ${STRENGTH[level].elo}`);
    await uci.send(`position fen ${fen}`);
    return uci.go(`go movetime ${Math.min(movetimeMs, STRENGTH[level].movetime)}`, { watchdogMs: 600 }); // sends "stop" on watchdog
  });
}
```

### Strength mapping
| Level | `UCI_LimitStrength` | `UCI_Elo` | `go movetime` | Intended feel |
|---|---|---|---|---|
| Medium | true | **1500** | 100 ms | Club beginner–intermediate |
| Hard | true | **2100** | 200 ms | Strong club player |

- Stockfish's `UCI_Elo` range is **1320–3190**, calibrated on the CCRL blitz scale with the full network (`search.h`). We run the **lite** network, so real strength at a given Elo setting is ⚠️ unverified: calibrate in the Chess phase by playing 200 games of Medium vs Hard vs our Easy engine and adjusting the Elo numbers until Hard beats Medium ≥ 75 % and Medium beats Easy ≥ 85 %.
- `Skill Level` (0–20) is the fallback knob if `UCI_Elo` behaves oddly with the lite net.
- **Calibrated (Oct 2026, lite net, 20 games each, no clock):** Medium v Easy 15–2 (3 drawn), **Medium scores 83 %**; Hard v Medium 17–2 (1 drawn), **Hard scores 88 %**. Close enough to the 85 % / 75 % targets at this sample size; settings kept (Elo 1500 / 2100, movetime 100 / 200 ms). Rerun with more games if players report levels feeling the same.
- **Strict think limit:** `movetime` ≤ 300 ms (schema), watchdog `stop` at 600 ms; the DO's fetch timeout is **1.5 s**.

### Draughts Hard (`gh-draughts-1`)
Our own TypeScript searcher (MIT, `packages/engine`), run in Node: iterative deepening alpha-beta with a transposition table up to `movetimeMs` (150 ms). No WASM, no licence issues.

## Measured (Oct 2026, `stockfish@19.0.0` npm, `bin/stockfish-19-lite-single.{js,wasm}` 21 KB + 1.79 MB, Node 24)
- Loading: `require("stockfish")("lite-single")` → `engine.sendCommand(cmd)`, output via `engine.listener = (line) => …`.
- **Cold start: 1.36 s wall, 2.2 s CPU.**
- Warm, 30 moves of a game each: **Hard (Elo 2100, movetime 200): CPU median 209 ms, p90 220 ms**; **Medium (Elo 1500, movetime 100): CPU median 164 ms, p90 372 ms** (CPU > movetime from V8 work around the search). Daily 240 CPU-s ⇒ ≈ 1,100 Hard or ≈ 1,450 Medium moves; each cold start costs ≈ 10 Hard moves of budget.
- Next.js 16 option confirmed: `outputFileTracingIncludes: { "/api/bots/chess/move": ["./server/bots/stockfish/**/*"] }` (keys are route paths, values globs from the app root).

## As built (Phase 7, Oct 2026)
- Route `apps/web/app/api/bots/chess/move/route.ts`: `maxDuration = 10`, no `runtime` export (Node is the default, and Cache Components forbids that option). Signature checked before parsing; bodies over 4 KB → 413.
- `server/bots/stockfish.ts` loads the build with `createRequire` from `process.cwd()/server/bots/stockfish/`; the build is vendored as **`.cjs`** because `apps/web` is `"type": "module"` (as `.js` it fails with "require is not defined"). Excluded from Prettier and ESLint.
- **Stockfish runs in a worker thread.** In Node the emscripten build sets the global `fetch = null` (to read its WASM from disk), which broke every later request in the same server (sign-ups failed with "No fetch implementation found", room creation with "fetch is not a function"). Found by running two E2E games at once; fixed by loading it in a `worker_threads` Worker (its own globals), telling the build `isMainThread = true` there so it loads as a normal module instead of a Web-Worker shim. A route test checks `fetch` survives a bot move. `process.cpuUsage()` still counts the worker's CPU.
- One search at a time per instance (a promise chain), up to 3 waiting, else `BUSY`; watchdog sends `stop` 600 ms after `movetime`; a broken engine is rebuilt on the next call; per-instance backstop 60 CPU-s per rolling hour → `QUOTA`.
- Measured through `next start`: cold 2.7 s, then Hard 292 ms and Medium 162 ms per request.
- Room side (`GameRoom.serviceBotAction`): only chess Medium/Hard; asks `Quota.allowBot()`; sends the FEN at the last pawn move or capture plus the moves since; 1.5 s `AbortSignal.timeout`; the answer is checked by applying it; errors, timeouts, refusals and illegal moves fall back to Easy+ and count as failures (3 in a row → rest 10 min). `BOT_SERVICE_URL` is a Worker var (local dev overrides it in `.dev.vars`).
- `Quota` DO: monthly 2 CPU-hours, daily = min(even share 240 s, what's left ÷ days left in the month); saved at most every 5 min.
- CI: the budget script fails if any file in `.next/static` mentions "stockfish"; E2E gets a throwaway `BOT_HMAC_SECRET`.

## Cold starts
- A cold instance loads ~1.8 MB of WASM and compiles it: 1.36 s measured, so the first bot move after a quiet spell will usually miss the DO's 1.5 s timeout and use the fallback. The first bot move after a quiet period may exceed the DO's 1.5 s timeout → that one move uses the built-in fallback; later moves hit a warm instance.
- No warm-up cron (Hobby cron is limited and it would burn CPU for nothing).

## Quota tracking (Vercel Hobby: 4 Active-CPU hours per month for the whole account)
**If the account goes over a Hobby limit, Vercel pauses it until 30 days have passed — the whole site, not just bots.** So bots get a hard budget well below the limit:

| Item | Value |
|---|---|
| Bot share of Active CPU | **2 CPU-hours / month** (50 %; the rest is for pages, auth, tickets, ingest) |
| Daily bot budget | 2 h ÷ 30 = **240 CPU-seconds / day** |
| Cost per Hard move | ≈ 0.2 s search + ≈ 0.02 s overhead → **≈ 1,100 Hard moves/day** (≈ 25–30 bot games); Medium ≈ 2,000 moves/day |

**Where the counter lives:** not in Neon (a write per bot move would keep Neon awake and burn its 100 CU-hours). A tiny global **`Quota` Durable Object** (one instance, `05-durable-objects.md`) keeps the day's bot CPU in memory with a checkpoint row every 5 minutes:
1. Before calling the service, the room asks `Quota.allowBot()` (RPC, ~0 CPU). Over budget → skip the call, use the fallback.
2. The service returns `cpuMs` measured with `process.cpuUsage()` around the search; the room adds it with `Quota.addBot(cpuMs)`.
3. The counter resets at 00:00 UTC; the monthly total is also kept so a heavy month tightens the daily budget (`daily = remainingMonthly ÷ daysLeft`).
4. **Backstop on Vercel:** each instance refuses with `QUOTA` after 60 CPU-seconds in any rolling hour (in-memory), so a bug in the DO counter can't run away.

Manual check: the Vercel usage page once a week during soft launch (`concerns.md`).

## Fallback (silent)
The room uses its **built-in engine** for that move when: the quota says no; the request times out (1.5 s); the response is `BUSY`, `QUOTA`, `ENGINE_ERROR` or non-200; or the returned move is illegal (validated with chess.js / our draughts engine). After 3 failures in a row, the room stops calling the service for 10 minutes. Players never see an error; only the logs do.

| Game | Built-in fallback |
|---|---|
| Chess | "Easy+" — our Easy searcher with a 4,000-node budget and no random picks |
| Draughts | Medium (depth 4) |

## Licences (GPL boundary)
- Stockfish and stockfish.js are **GPL-3.0**. They run **only on our server**; we don't distribute them to anyone, so GPL's source-offer duties (triggered by *conveying* copies) don't apply. GPL-3.0 (unlike AGPL) doesn't treat network use as conveying. We still keep `Copying.txt` next to the files and credit Stockfish on `/legal/credits`.
- **Never** import anything from `server/bots/` into client code. CI check: the build output's `.next/static` must contain no file whose content matches `stockfish` (grep), and the bot route module is `server-only`.
- chess.js (BSD-2) is fine on both sides.

## Tests
- Unit (Node, Vitest): signature checks (bad sig, stale ts, missing headers → 401); schema rejects big bodies; `bestMove` returns a **legal** move for 50 sample FENs (checked with chess.js); `movetime` respected within +150 ms; queue returns `BUSY` beyond 3 waiting; per-instance hourly backstop.
- DO tests (`@cloudflare/vitest-pool-workers`, `fetchMock`): timeout → fallback move applied; 429 `QUOTA` → fallback; illegal move → fallback; `Quota` DO counts and resets at the day boundary.
- E2E: a private chess game vs Hard completes (bot service running locally via `next start`).
- Bundle check described above.

## Cost on Cloudflare
One bot move = 1 alarm (request) + 1 subrequest (`fetch`, free plan allows 50 per invocation) + 2 `Quota` RPCs (requests). Waiting for the response doesn't count as DO CPU.
