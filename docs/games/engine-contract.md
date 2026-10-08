# Engine contract

Every game in `packages/engine/src/games/<slug>/` implements `GameDefinition`. The engine is **pure**: no I/O, no clock, no `Math.random()`.

```ts
// packages/engine/src/types.ts
export type SeatIndex = number;
export type Result<T, E> = { ok: true; state: T; events: GameEvent[] } | { ok: false; error: E };

export interface Rng {
  int(maxExclusive: number): number;     // uniform, rejection sampling (no modulo bias)
  shuffle<T>(arr: readonly T[]): T[];    // Fisher–Yates
  counter(): number;                     // draws consumed so far (persisted)
}

export interface Ctx<R> { rng: Rng; rules: R; now: number /* injected server time: logging only, EXCEPT clocked games (chess, draughts, timed property, football windows) which use it as the authoritative clock — still pure, because the room injects it */ }

export interface GameDefinition<S, A, V, R extends RuleConfigBase> {
  slug: GameSlug;
  minPlayers: number; maxPlayers: number;
  presets: { naija: R } & Record<string, R>;
  ruleSchema: z.ZodType<R>;                       // validates host-custom rules
  actionSchema: z.ZodType<A>;                     // validates client actions before apply()
  setup(players: number, ctx: Ctx<R>, first?: SeatIndex): S; // `first` = the room's "Who goes first" pick (default 0)
  currentSeats(s: S): SeatIndex[];                // whose input is awaited (RPS: many)
  legalActions(s: S, seat: SeatIndex, rules: R): A[];
  apply(s: S, input: { seat: SeatIndex; action: A }, ctx: Ctx<R>): Result<S, RuleErrorCode>;
  timeoutAction(s: S, seat: SeatIndex, rules: R, rng: Rng): A; // what happens when a turn timer expires
  autoAdvance(s: S, rules: R): { seat: SeatIndex; action: A; afterMs: number } | null; // server-made moves after a pause (e.g. TTT next round)
  eventPauses?: Partial<Record<string, number | ((e: GameEvent) => number)>>; // delay turn clocks after events (summed over everything one action caused), e.g. RPS { revealed: 2400 }, Ludo moved = 90 ms per hop
  chainTurns?: boolean;                             // apply a whole turn in one write: afterMs-0 auto-advances and a bot's follow-ups; the client paces playback (Ludo)
  botThinkMs?(s: S, action: A): readonly [number, number]; // bot pause before this move (default [300, 900]); the room previews the bot's move to size it
  view(s: S, viewer: SeatIndex | "spectator"): V;      // MUST strip hidden info
  isOver(s: S): boolean;
  ranking(s: S): SeatIndex[][];                    // places; inner arrays = ties
  bots: Record<"easy" | "medium" | "hard", (s: S, seat: SeatIndex, rules: R, rng: Rng) => A>;
}
```

## RNG

- Seeded per game with 128-bit seed from `crypto.getRandomValues` in the DO.
- Algorithm: a fast, well-tested PRNG (e.g. `sfc32` or `xoshiro128**`) seeded via a hash of the seed + counter. Not cryptographic, but the seed never leaves the server, so players cannot predict it.
- `counter` persisted after each action; restoring `(seed, counter)` reproduces the exact stream → bugs are replayable from logs.
- Dice: `rng.int(6) + 1`. Shuffles: `rng.shuffle(deck)`.

## RuleConfig

```ts
export interface RuleConfigBase { turnSeconds: number /* 10–120, default 30 */; }
```

Each game extends it. Host-custom configs are validated by `ruleSchema` and stored in the room. Quick-match always uses `presets.naija`.

## Views and hidden info

`view()` is the only function whose output is sent to clients. Tests assert that serialising `view(s, k)` contains no card ids from other seats' hands (property test over random states).

## Bots

- **Easy**: random legal action (weighted slightly towards "obvious" moves).
- **Medium**: greedy heuristic per game (documented in each game file).
- **Hard**: heuristic + short lookahead using **only information that seat can see** (bots receive `view(s, seat)` + their own private info, never the full state). Enforce by giving bot functions the projected view, not `S`, in implementation.

## Errors

```ts
type RuleErrorCode =
  | "NOT_YOUR_TURN" | "ILLEGAL_MOVE" | "GAME_OVER" | "BAD_ACTION"
  | "MUST_ANSWER_PENALTY" | "MUST_PLAY_REQUESTED_SHAPE" | "NO_SUCH_CARD"
  | "NEED_SIX" | "OVERSHOOT" | "ALREADY_THREW";
```

## Required tests per game (see 12-testing.md)

- Invariants hold after any sequence of random legal actions (property test, 1,000+ runs).
- Every game terminates within a bound (or by rule) when all seats play random legal moves / timeouts.
- `apply` rejects every action not in `legalActions`.
- `view` leaks nothing.
- Presets validate against `ruleSchema`.

## Browser-safe entry points

Zod schemas live in each game's `schemas.ts` and are only imported by the full `GameDefinition` (server). Each game also exposes a zod-free subpath for client previews, e.g. `@gamehub/engine/tictactoe` (`tttLegalActions`, `tttNaija`, types). Client components must import from these, never from the package root, or zod lands in the game bundle.

## As built and new-game notes

- **Bots receive the full state `S` today** (`bots: Record<level, (s: S, …) => A>` in `packages/engine/src/types.ts`), not the projected view described in "Bots" above. Hidden-information games rely on each bot reading only its own seat's private data (Whot bots read only their own hand and public `misses`). New hidden-info games (property decks, football option sets) must follow the same rule, and their bot tests assert it by running the bot on a state whose other seats' private fields are scrambled.
- **Clocked games** (chess, draughts): `ctx.now` is the server receive time and the move action carries `mt` (client think time, copied from `act.m` by the room). A server-only `flag` action ends a game on time; `apply` rejects it from clients.
- **Remote bots** (bot service): the contract's `bots` stay synchronous and pure. For levels that use the bot service, the room checks `GameDefinition.remoteBot?(s, seat, level) → { game, level, position, movetimeMs } | null` before calling the local bot; on any failure it calls the local `bots[level]` (which is the documented fallback engine).
- **Injected data:** `createFootballGame(dataset)` returns the football `GameDefinition` with the dataset closed over, so `packages/engine` keeps zero dependencies.
- `GAME_SLUGS` gains `chess`, `draughts`, `property`, `football` (engine, protocol `game-slug.ts` and the Postgres enum together, one game at a time).
- New `RuleErrorCode`s are listed in `03-realtime-protocol.md`.
- Per-game termination bounds for property tests: chess ≤ 600 plies (with automatic fivefold/75-move); draughts ≤ 600 plies; property timed by its clock, classic ≤ 600 turns (3-hour cap); football: fixed length (≤ 120 minutes + penalties).
