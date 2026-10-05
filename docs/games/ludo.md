# Ludo

Players: 2–4. Each player has 4 seeds. First to bring all 4 seeds home wins.

## Board model

- **Track**: 52 squares, index 0–51, shared. Each colour's **start square** is `colour * 13` (red 0, green 13, yellow 26, blue 39).
- **Home column**: 6 squares per colour (5 lane squares + home). A seed enters its home column after passing square `start - 1` (relative progress 50 → 51 → column).
- Represent a seed by **relative progress** `p`: `-1` = in yard, `0..50` = on track (absolute = `(start + p) % 52`), `51..56` = home column, `56` = home (finished). Moves needed from start to home = 56.
- **Safe squares** (no capture): each colour's start square + the four "star" squares at `start + 8` (absolute 8, 21, 34, 47). Configurable.
- 2-player: players take opposite colours (red vs yellow) by default; option for each to control 2 colours is out of scope for v1.

## Naija Standard preset (your choices)

```ts
export const ludoNaija: LudoRules = {
  turnSeconds: 30,
  needSixToLeaveYard: true,
  sixRollsAgain: true,
  maxConsecutiveSixes: 3,       // third six in a row forfeits the turn (no move)
  captureGivesBonusRoll: true,
  homeGivesBonusRoll: true,     // reaching home with a seed = extra roll
  exactRollToFinish: true,      // can't overshoot home
  safeSquares: true,
  blockades: false,             // two own seeds on one square block passage (off)
  captureSendsHome: true,       // captured seed back to yard
  autoMoveSingle: true,         // only one legal move → play it automatically
  endMode: "playOn",            // "playOn" | "firstFinisherEnds" (others ranked by progress)
};
```

All fields customizable per private room.

## Turn flow

1. `roll` → die value `d` (server RNG).
2. Compute legal moves:
   - Seed in yard: can leave only if `d === 6` (when `needSixToLeaveYard`), lands on start square (`p = 0`).
   - Seed on track/column: moves `d` steps; illegal if it would pass 56 (when `exactRollToFinish`).
   - If `blockades` on: can't pass/land on a square holding two seeds of another colour.
3. No legal move → turn passes automatically (still counts toward six-rule).
4. Exactly one legal move → **auto-move** after 400 ms (saves a tap and a round-trip; config `autoMoveSingle`, default on).
5. Otherwise player sends `move { seed }`.
6. Landing on a non-safe square with opponent seed(s) → capture (sent to yard). Multiple opponents on the square: all captured (only possible if blockades off).
7. Bonus roll if: rolled 6 (and under max), captured, or reached home. Bonuses don't stack into multiple rolls; at most one extra roll per move.
8. Win: all 4 seeds home. Game continues for remaining places (`playOn` default for Ludo since games are long and placing matters); option `firstFinisherEnds` ranks others by total progress.

## State

```ts
type LudoState = {
  players: number;
  colours: Colour[];               // seat → colour
  seeds: number[][];               // seat → 4 progress values (-1..56)
  turn: SeatIndex;
  phase: "roll" | "move";
  die: number | null;
  sixesInRow: number;
  finished: SeatIndex[];
  over: boolean;
};
```

## Actions

```ts
type LudoAction = { type: "roll" } | { type: "move"; seed: 0 | 1 | 2 | 3 };
```

Timeout action: `roll`; then if moves exist, the seed with the **highest progress** that can legally move (deterministic).

## View
Entire state is public → `view` returns state as-is plus `legalSeeds` for the viewer when it's their move.

## Events
`rolled{seat,d}`, `moved{seat,seed,from,to,path}`, `captured{by,victimSeat,seed}`, `entered_home{seat,seed}`, `six_forfeit{seat}`, `finished{seat}`.

`path` lets the client animate step by step (hop per square, 90 ms each).

## Bots
- Medium priority: capture > leave yard on 6 > move into safe square > advance seed closest to home > avoid landing within 1–6 squares in front of an opponent.
- Hard: Medium + scores each move by danger (number of opponent seeds that could hit it next turn with probability) and blocks opponents near their home entry.

## Invariants
- Each seed `-1 ≤ p ≤ 56`.
- No two seeds of different colours on the same non-safe absolute square after a move (capture happened).
- Sum of finished seeds per seat ≤ 4; seat finished ⇔ all 4 at 56.

## UI notes
- SVG board, 15×15 grid, colours from design system (`11-design-system.md`), star safe squares marked.
- Tap a highlighted seed to move; or tap the destination ghost.
- Die: CSS 3D cube, 600 ms roll animation (masks network latency).

## As built (Phase 5)

- **Code:** `packages/engine/src/games/ludo/` — `rules.ts`, `state.ts`, `core.ts` (zod-free: board constants, `target`, `legalSeeds`, `capturesAt`, playback timings; the browser imports `@gamehub/engine/ludo`), `index.ts`, `bots.ts`, `schemas.ts`.
- **Seats and colours:** seat order is clockwise colour order (red, green, yellow, blue); 2 players are red v yellow, 3 players red, green, yellow.
- **State** also keeps `movable` (seeds that can use the die, set when rolling), `lastRoll` (so the die keeps showing) and `places`. The whole state is public; `view` returns it as is.
- **A six with nothing to move** still earns its roll. `maxConsecutiveSixes`: 0 (no limit) or 2–5 (1 would forfeit every six). `captureSendsHome: false` means no capturing at all (seeds share squares).
- **Auto-move** also covers several seeds that can move but sit on the same spot (e.g. all in the yard on a 6) — no real choice. It's applied straight away (`afterMs: 0`) and chained into the same write as the roll; the client shows the die, then the hops.
- **Chained turns:** a bot's whole turn (roll, move, bonus roll…) is one storage write; clients play the burst back (die 900 ms, 90 ms per hop, 250 ms settle). Measured: a 4-bot game is ~1,300 actions but ~1,050 row writes (528 turns), down from ~2,550.
- **Timeouts:** roll, then move the seed furthest along. A human who times out gets a fresh clock for the move after the roll.
- **Bots:** Easy random. Medium: capture > reach home > leave yard > reach safety > progress, minus 25 when the landing square is threatened. Hard scores each move: progress + capture value (victim's progress) + home/yard/home-column bonuses − (chance of being hit next round × what the seed would lose) + the same for the square it leaves. Hard beats Easy 93 % head to head and wins 79 % of 4-player games against three Easy bots (1,000 games each).
- **Events** add `no_move{seat}`; `moved.path` is in the mover's progress values.
