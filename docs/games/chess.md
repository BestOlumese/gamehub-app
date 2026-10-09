# Chess

Players: exactly 2. Standard chess only (no variants). Server-authoritative clocks, draw offers, resign, takebacks (private rooms only), premoves, bots at three levels.

Sources for every fact below: `docs/research/sources.md` → "Chess".

## Rules engine: chess.js inside our engine

| Option | Licence | Decision |
|---|---|---|
| **chess.js 1.4.0** | BSD-2-Clause | **Use** for move generation, legality, SAN, FEN, PGN, checkmate/stalemate, insufficient material. ESM build ≈ 107 KB raw (verify gzip size at install). |
| chessops / scalachess | GPL-3.0 / AGPL | Not used (GPL family in the browser bundle is banned, `AGENTS.md` §1). |
| Our own move generator | ours (MIT) | Only for the **Easy bot** (speed), never for legality. |

chess.js is pure: no I/O, no clock, and its Zobrist keys come from a **fixed-seed** generator (no `Math.random`), so it is allowed inside `packages/engine` (verify again at install).

chess.js objects are not stored. State keeps the FEN, the move list and the position after every ply (`history`, used for takebacks and repetition counts); each action rebuilds `new Chess(fen)`, applies one move and reads the new FEN.

**Measured (Oct 2026, chess.js 1.4.0, Node 24 on a busy dev machine):** a whole move as the room applies it is **1.7 ms median, 3.7 ms p95** (first call ~58 ms while the JIT warms). chess.js's `moves({ verbose: true })` is the trap: it builds SAN (with check/mate) for every move, **15 ms at the start position and 91 ms in Kiwipete**, so the server never calls it. Checkmate/stalemate use our own move generator (no legal moves + in check); the view doesn't carry a legal-move list (the client asks chess.js for one piece at a time, 1–6 ms, when a piece is tapped).

We do **not** use chess.js's own draw verdicts as-is: its `isDraw()` treats the 50-move rule as automatic and has no 75-move/fivefold. Repetition counts and the move counters are ours (below).

Client: the board UI imports the zod-free subpath `@gamehub/engine/chess`, which re-exports chess.js for legal-move highlighting and premove validation. chess.js is BSD, so shipping it to browsers is fine.

## Full rule list (FIDE Laws, standard chess)

All of FIDE's movement rules come from chess.js: castling (both sides, through/into check forbidden), en passant (only immediately), promotion to Q/R/B/N, check, checkmate, stalemate.

### Game end and draws — what we do

| Condition | FIDE | Lichess | Chess.com | **GameHub (Naija Standard)** | Rule option |
|---|---|---|---|---|---|
| Checkmate | win | win | win | win | — |
| Stalemate | draw | draw | draw | **draw** | — |
| Insufficient material / dead position | automatic draw | auto (K v K, K+minor v K, same-colour bishops) | auto | **auto draw** on K v K, K+B v K, K+N v K, and any position where all remaining bishops stand on one colour and nothing else but kings is left. Other dead positions (blocked pawn chains) are not detected. | — |
| Threefold repetition | **claim** | claim (optional "auto-claim" preference) | auto | **auto draw** | `drawClaims: "auto" \| "claim"` |
| Fivefold repetition | automatic | auto | auto | auto (always) | — |
| 50-move rule | **claim** | auto at 100 half-moves | auto | **auto draw** | `drawClaims` |
| 75-move rule | automatic | (50 is already auto) | (auto at 50) | auto (only reachable in `claim` mode) | — |
| Agreement | draw | draw | draw | **draw** (`offer_draw` → `accept_draw`) | — |
| Flag fall vs insufficient material | draw | draw | draw | **draw** when the side with time left has only a king, or a king and a single bishop or knight (it can't mate). King + two knights counts as "can mate" (a helpmate exists), as on lichess. | — |
| Resign | loss | loss | loss | loss | — |

**Why auto for threefold and 50 moves:** there is no arbiter, players are on phones, and a missed "Claim draw" tap (or a slow network during the claim) turns a drawn position into a lost one on time. Chess.com auto-applies both; lichess auto-applies 50 moves and lets players opt into auto threefold. `drawClaims: "claim"` keeps strict FIDE behaviour (a "Claim draw" button appears when available; fivefold/75-move still end the game automatically) for clubs that want it.

### Repetition and counters (ours)
- `positions: Record<string, number>` keyed by FEN **without** the move counters (piece placement + side + castling + en-passant — the en-passant square only when a capture is actually legal; chess.js 1.x already omits it otherwise; verify at install).
- Cleared on every irreversible move (pawn move, capture, castling-rights change) — keeps the map small (≤ 100 entries).
- `halfmoveClock` comes from the FEN.

### Abort
- **White** has 30 s from the start to make the first move; **Black** has 30 s from White's first move. Missing it → **aborted**: no result, no rating change, room returns to the lobby with a "Game aborted" toast.
- Either player may tap **Abort** until both have moved.
- Chess.com uses 15 s (bullet) / 20 s (blitz) / 60 s (rapid); lichess's figure couldn't be verified. 30 s for everything is simpler and kind to slow networks. Rule option `abortSeconds` (15–60).

## Clocks

### Time controls
Category by **estimated game seconds = base + 40 × increment** (lichess). Lichess boundaries: Bullet 30–179 s, Blitz 180–479 s, Rapid 480–1499 s, Classical ≥ 1500 s. We have three rating pools (`08-matchmaking-ratings.md`), so **Classical is folded into Rapid**.

| Preset | Est. seconds | Category |
|---|---|---|
| 1+0 | 60 | Bullet |
| 2+1 | 100 | Bullet |
| 3+0 | 180 | Blitz |
| 3+2 | 260 | Blitz |
| 5+0 | 300 | Blitz |
| 5+3 | 420 | Blitz |
| 10+0 | 600 | Rapid |
| 10+5 | 800 | Rapid |
| 15+10 | 1000 | Rapid |
| 30+0 | 1800 | Rapid (Classical on lichess) |
| **No clock** | — | Private rooms only, unrated |

UltraBullet (< 30 s) isn't offered: phone round-trips from Lagos (~100–150 ms to a European DO) make it unfair.

**"No clock" still can't freeze a game** (`00-overview.md` success criteria): each move has a generous `moveLimitSeconds` (default 300, 60–900). Running out = the standard timeout action (below). It's a per-move inactivity limit, not a chess clock, so it isn't shown as one.

### Server-authoritative clock with lag compensation

The clock runs on **server time** in the room DO. The engine is still pure: the room injects `ctx.now` (server receive time) and the client's reported think time. This is the one place the engine contract's `now` stops being "logging only" (`engine-contract.md` is updated).

Per player (`ClockSide`): `remainingMs`, `lag: LagTracker`.

On every accepted move by the side to move:

```ts
// all integers in ms
elapsed   = now - turnStartedAt;                         // server time since this side's clock started
clientMt  = clamp(action.mt ?? elapsed, 0, elapsed);     // client-reported think time (0 for premoves)
lag       = elapsed - clientMt;                          // network + device delay as seen from the server
comp      = Math.min(lag, side.lag.quota);               // forgive at most the current quota
side.lag.quota = Math.min(side.lag.quota + side.lag.gain - comp, side.lag.max);
moveTime  = Math.max(0, elapsed - comp);
side.remainingMs = side.remainingMs - moveTime + incrementMs;  // increment added after the move
turnStartedAt = now;                                      // other side's clock starts
```

Lag tracker init (lichess `LagTracker.init`, scalachess source):
- `gain = min(1000, est × 4 + 150)` ms where `est` = estimated game seconds (base + 40 × increment) — lichess: `min(100 cs, est × 2 / 5 + 15 cs)`.
- `quota = 3 × gain` at start; `max = 7 × gain`.
- Example 3+2 (est 260 s): gain = min(1000, 1040 + 150) = 1000 ms; quota starts 3 s, caps 7 s.
- Example 1+0 (est 60 s): gain = 240 + 150 = 390 ms; quota 1.17 s, cap 2.73 s.

Why trust `mt` at all? It can only *reduce* charged time by up to the quota, and the quota refills slowly. A cheater who always reports 0 gets at most `gain` per move — the same forgiveness an honest laggy player gets. That's exactly lichess's trade-off.

**Flag fall.** A side flags when `remainingMs - (now - turnStartedAt) + min(quota, 2000) ≤ 0` — lichess grants up to 2 s of the quota as grace at the flag check so a move "in flight" isn't lost.

**Alarm.** The room's single alarm is set to the **flag time** of the side to move: `turnStartedAt + remainingMs + min(quota, 2000)` (plus the abort deadline before the first moves). With the lazy alarm (`05-durable-objects.md`), a later flag time doesn't call `setAlarm`; an earlier one does. Each move moves the flag time, so a chess move usually costs 1 row + sometimes 1 alarm write.

**Client display.** Snapshots carry `clock: { white, black, running: "w" | "b" | null, turnStartedAt }` in **server time**. The client shows `remaining - (serverNow() - turnStartedAt)` where `serverNow = Date.now() + offset` from pongs (`04-reconnection.md`). It never decides a flag; the server does.

### Premoves (client-side, no time cost)
- While it's the opponent's turn the player may queue **one** premove (lichess: premoves are free; chess.com charges 0.1 s). Shown as a dashed arrow; tap anywhere to cancel.
- When the opponent's move arrives, the client checks the premove against the new position (chess.js) and, if legal, sends it at once with `mt: 0`. Illegal → discarded silently.
- The server treats it as a normal move with `mt = 0`: the lag compensation above forgives the network time up to the quota, so a premove costs ≈ 0 for a normal connection. No special trust, no extra protocol.
- Promotion premoves auto-queen (setting "Always promote to queen" for premoves).
- Lichess also lets you chain several premoves on some clients; we don't (one is enough, simpler).

## Takebacks
- `takebacks: boolean` rule. **Default on in private rooms, forced off in quick-match (ranked) and tournaments.**
- Request: `request_takeback` → opponent sees "@ada wants to take back their move. Allow / No". Accept undoes the requester's last move (and the opponent's reply if one was made since, so it's the requester's turn again).
- One open request at a time; auto-declines after 20 s or when any move is made; max 3 requests per player per game.
- Clocks: remaining times are **not** restored; the running side's clock restarts at the moment of acceptance (keeps it simple and un-gameable).
- Repetition map and counters are rebuilt from the stored move list (cheap: ≤ a few hundred moves, done only on takeback).

## Draw offers
- `offer_draw` (max 3 per player per game, at least 10 moves apart after a decline), shown to the opponent as a banner with Accept / Decline. Making a move declines it. `accept_draw` ends the game ½–½.
- A draw offer can be sent while it's not your turn.

## Disconnects (overrides the generic seat rules where stated)

| Game kind | Clock | After 60 s grace |
|---|---|---|
| **Ranked** (public quick-match) | Keeps running | **No bot takeover.** The opponent sees "@ada left. Claim victory?" with **Claim win** (or **Claim draw** if the claimer lacks mating material by the flag rule above) and **Wait**. Claiming ends the game. If the absent player returns first, play continues. If nobody claims, the absent side simply flags. |
| Unranked, private, tournament | Keeps running | A **Medium** bot plays the seat **on that player's remaining clock** until they return (standard seat flow, `04-reconnection.md`). |

Timeout action (a connected player who doesn't move while the room needs a move, e.g. "No clock" move limit): **flag/forfeit** in clocked games (the clock already decides); in "No clock" games, a bot move (Easy) — same rule as Tic-tac-toe. After 3 consecutive timeouts the seat becomes `left` (standard).

## Naija Standard preset and RuleConfig

```ts
export type ChessTimeControl = { baseSeconds: number; incrementSeconds: number } | null; // null = No clock

export type ChessRules = {
  turnSeconds: number;            // RuleConfigBase; unused when a clock runs (kept for the contract)
  timeControl: ChessTimeControl;  // preset list above
  moveLimitSeconds: number;       // "No clock" per-move limit, 60–900
  drawClaims: "auto" | "claim";   // threefold + 50-move
  takebacks: boolean;             // forced false in ranked/tournament
  premoves: boolean;
  abortSeconds: number;           // 15–60
  autoQueenPremove: boolean;
};
// Colours come from the room's "Who goes first" setting (Oct 2026): the first seat plays White.
// Random / Takes turns (colours swap each rematch) / Last winner / Seat 1.

export const chessNaija: ChessRules = {
  turnSeconds: 30,
  timeControl: { baseSeconds: 300, incrementSeconds: 3 }, // 5+3 blitz
  moveLimitSeconds: 300,
  drawClaims: "auto",
  takebacks: true,
  premoves: true,
  abortSeconds: 30,
  autoQueenPremove: true,
};
```

Quick-match picks the time control (any preset except No clock); everything else is Naija Standard with `takebacks: false`.

## State, actions, view, events

```ts
type Side = "w" | "b";
type LagTracker = { gain: number; quota: number; max: number };
type ClockSide = { remainingMs: number; lag: LagTracker };

type ChessState = {
  white: SeatIndex;                 // seat playing white
  fen: string;
  moves: string[];                  // UCI ("e2e4", "e7e8q") — PGN is rebuilt on demand
  san: string[];                    // for the move list without re-parsing
  positions: Record<string, number>; // repetition map since the last irreversible move
  clock: { w: ClockSide; b: ClockSide; turnStartedAt: number | null } | null; // null = no clock
  firstMoveDeadline: number | null; // abort deadline
  drawOffer: { by: Side; atPly: number } | null;
  takeback: { by: Side; atPly: number; expiresAt: number } | null;
  offersUsed: { draw: Record<Side, number>; takeback: Record<Side, number> };
  claimable: { draw: boolean; win: boolean; by: Side | null }; // set by the room when the opponent is gone (ranked)
  result: { winner: Side | null; reason: ChessEndReason } | null;
};

type ChessEndReason =
  | "checkmate" | "resign" | "timeout" | "stalemate" | "insufficient" | "threefold" | "fivefold"
  | "fifty" | "seventyfive" | "agreement" | "timeout_vs_insufficient" | "claim_win" | "claim_draw" | "aborted";

type ChessAction =
  | { type: "move"; uci: string; mt?: number /* client think time, ms; 0 = premove */ }
  | { type: "resign" }
  | { type: "offer_draw" } | { type: "accept_draw" } | { type: "decline_draw" }
  | { type: "claim_draw" }                // only with drawClaims: "claim"
  | { type: "request_takeback" } | { type: "accept_takeback" } | { type: "decline_takeback" }
  | { type: "abort" }                     // only before both sides have moved
  | { type: "claim_victory" } | { type: "claim_absent_draw" } // ranked, opponent gone past grace
  | { type: "flag" };                     // server-only (timeout action); rejected from clients

type ChessView = ChessState & { you: Side | null; legal?: string[] /* UCI list when it's your move */ };
```

`view` returns the full state (chess has no hidden information) plus `you` and the legal moves for the viewer on move (saves the client a move-gen pass on slow phones; the client can still compute them itself for premoves).

Events (animation/sound only): `moved{side, uci, san, capture, check}`, `castled`, `promoted{piece}`, `check{side}`, `draw_offered{by}`, `draw_declined`, `takeback_requested{by}`, `takeback_done{plies}`, `flagged{side}`, `game_over{winner, reason}`, `aborted`.

Think time: the move action itself carries `mt` (validated 0–24 h). It can only reduce the lag charged, up to the quota (see Clocks), so no separate envelope is needed. The first move of each side isn't charged; both clocks start after Black's first move.

As built: `history` replaces the repetition map (repetitions = occurrences of the current position among the last `halfmove + 1` entries). `legalActions` uses our move generator (perft-checked). New engine-contract hooks: `turnDeadline` (abort window → flag time → per-move limit), `botReply` (bots accept takebacks and decline draws when it isn't their turn), `aborted` (the room returns to the lobby with no result).

## Bots

| Level | Where | How | Strength target |
|---|---|---|---|
| **Easy** | In the room DO | Our own TypeScript searcher (0x88 board, MIT, ours): 1-ply + quiescence on captures, material + piece-square tables, **node budget 400** (time can't be measured inside a Worker — `Date.now()` doesn't advance during CPU work), plus a 20 % chance of picking the 2nd/3rd best move. Quiescence is capped at 4 captures with delta pruning; if the budget runs out mid-search, the root moves scored so far (captures first) still count. | Beginner (≈ 600–900 lichess, unverified) |
| **Medium** | Bot service (`15-bot-service.md`) | Stockfish 19 lite single-threaded (WASM, Node), `UCI_LimitStrength=true`, `UCI_Elo=1500`, `go movetime 100` | ≈ 1500 CCRL-blitz scale (calibrated for the full net; the lite net's calibration is ⚠️ unverified) |
| **Hard** | Bot service | Same, `UCI_Elo=2100`, `go movetime 200` | ≈ 2100 |

- The room calls the bot service **from the alarm** when a bot seat is on move: one HMAC-signed `POST` with `{ fen, moves (since last irreversible), level, movetimeMs }`. Waiting on `fetch` doesn't count toward the DO's CPU time.
- **Strict think limit:** service-side `movetime` (100/200 ms) + a hard 1.5 s request timeout in the DO.
- **Fallback (silent):** timeout, non-200, `429 QUOTA`, or an illegal move → the room plays the **built-in engine at its strongest setting** ("Easy+" = node budget 4,000, no random picks) and marks the bot `fallback` for 10 minutes (no further calls from that room). Players never see an error.
- **Measured (Oct 2026, plain Node, ~9 µs per position):** the first budgets (1,500 Easy / 4,000 Easy+) took 9 ms median, 31 ms p95 and 70 ms for Easy+, far over the 10 ms Workers Free limit. After removing allocations from move generation, in-place move ordering, a flat score table, a shared out-of-budget signal and bounded quiescence: **Easy 400 nodes p95 ≈ 4.5 ms; Easy+ 500 nodes (depth 2 when it fits) p95 ≈ 5.5 ms**, plus ~2–4 ms for applying the move. Both are weak at converting won positions (40 Easy+ v Easy games: mostly draws by repetition); Medium/Hard strength comes from Stockfish.
- Bot clocks: bots play on the clock like people (their think time + network). Bot think pause (`botThinkMs`): **0.5–1.5 s** a move; 0.3–0.8 s under a minute left; 0.15–0.4 s under 20 s, so they don't flag. (First built as 1–4 % of the remaining time, which meant up to 12 s a move at the start of a 5-minute game; Best found that slow, Oct 2026.) The bot service's search and the network come on top.
- **Stockfish never ships to browsers.** The client has no engine at all (no analysis feature in v1).

## UI notes
- **Board:** our own SVG board (8×8 `<rect>`s, one `<use>` per piece from a sprite). No chessground (GPL-3.0). Squares in our palette (`11-design-system.md`).
- **Pieces:** **Cburnett** set from Wikimedia Commons under its **BSD 3-clause** option (the same artwork lichess ships as GPLv2+; Commons offers GFDL / CC BY-SA 3.0 / BSD / GPLv2+ and we pick BSD). Credit "Chess pieces by Colin M.L. Burnett (Cburnett), BSD licence" on `/legal/credits` and in the sprite's source comment. Fallback if anyone doubts the BSD grant: **rhosgfx** (CC0) from the lichess repo.
- Tap a piece → legal targets dotted; tap target (or drag). Promotion picker (Q R B N) as a small sheet over the promotion square.
- Last move highlighted (amber 35 %), king in check ringed `--danger`.
- Move list in SAN (two columns, auto-scroll, tap to view a past position read-only); **PGN export** (copy / download `.pgn` with our tags: Event "GameHub", Site, Date, White, Black, Result, TimeControl, Termination); **FEN copy**.
- Board flip button; player at the bottom by default.
- Clocks: big tabular numbers on the two player cards; running clock in `--accent`; under 10 s turns `--danger`; low-time tick sound (≤ 10 s, once per second, respects sound setting).
- Sounds (generated, like Whot): move, capture, check, castle, game end.
- **Keyboard play:** type a move in SAN or UCI (`e4`, `Nf3`, `e2e4`) into a move box; arrow keys to step through the move list.
- **Screen readers:** each move announced via an `aria-live` region ("White: knight to f3, check"); the board is a grid of buttons labelled "e4, white pawn".
- Draw offer / takeback request banners with buttons; "Claim win" sheet for ranked disconnects.

## Invariants
- `fen` always legal (chess.js `validateFen`), side to move matches ply parity.
- Exactly one king per side; no pawns on ranks 1/8.
- `moves.length === san.length`; replaying `moves` from the start reproduces `fen`.
- Clock: `remainingMs ≥ 0` once a game is over by any reason other than timeout; quota within `[0, max]`.
- `result` set ⇔ game over; no action except none accepted after.

## Tests
- **Perft** (chess.js wrapper, our Easy-bot move generator): start position depth 1–4 = 20, 400, 8,902, 197,281; Kiwipete depth 1–3 = 48, 2,039, 97,862; plus positions 3–6 from the Chess Programming Wiki perft set (verify numbers at write time). The Easy-bot generator must match chess.js on every node.
- Draw rules: each row of the table with `drawClaims` auto and claim; en-passant-sensitive repetition; timeout vs insufficient material; fifty/seventy-five boundaries (99/100/149/150 half-moves).
- Clocks: lag compensation maths (golden tests from the formulas above), quota caps, increment, flag grace, alarm = flag time.
- Abort timers; takeback rules (limits, expiry, rebuild of repetition map); draw-offer limits.
- Properties (≥ 1,000 runs): random legal games end (≤ 600 plies with fivefold/75 auto); illegal actions rejected; determinism; every view's `legal` equals chess.js legal moves.
- Bots: Easy returns legal moves within its node budget; bot-service fallback path (mock fetch: timeout, 429, illegal move).
- E2E: two players, 1+0 game until one flags; premove executes at 0 cost (clock unchanged ± lag); reconnect within grace keeps the clock running.

## Free-tier cost per game
≈ 80 plies per game → ~80 state writes + up to ~80 alarm writes (flag time moves earlier on many moves) → **≈ 120–160 rows**, ≈ 80 requests (incoming WS messages ÷ 20 is tiny; alarms for bots and flags dominate). Bot games add ≤ 1 bot-service call per bot move (Vercel, not Cloudflare). See `13-free-tier-budget.md`.
