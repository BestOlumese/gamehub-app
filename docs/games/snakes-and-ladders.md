# Snakes & Ladders

Players: 2–8. Pure luck. First to reach square 100 wins.

## Boards

Choice: **classic fixed board + a few hand-designed presets**, room picks one.

```ts
type Board = { id: string; name: string; snakes: Record<number, number>; ladders: Record<number, number> };
```

### `classic` (the well-known 1943 Milton Bradley layout)
- Ladders: 1→38, 4→14, 9→31, 21→42, 28→84, 36→44, 51→67, 71→91, 80→100
- Snakes: 16→6, 47→26, 49→11, 56→53, 62→19, 64→60, 87→24, 93→73, 95→75, 98→78

Double-check this layout against a reference before shipping.

### Presets to design (Phase 6)
- `quick` — more ladders, fewer snakes (short games, ~10 min with 4 players).
- `lagos-traffic` — long snakes near the top ("one-chance" back to the start).
- `balanced` — symmetric risk.

Each preset must pass a simulation test: 10,000 random games of 4 players → median game length between 25 and 60 rounds, no infinite loops, no snake head on a ladder bottom, no snake/ladder on 1 or 100.

## Naija Standard preset

```ts
export const snakesNaija: SnakesRules = {
  turnSeconds: 15,              // short: the only action is "roll"
  board: "classic",
  exactRollToFinish: true,      // overshoot → stay put
  sixRollsAgain: true,
  maxConsecutiveSixes: 3,
  needSixToStart: false,
  bump: false,                  // landing on another player sends them to 1 (off)
  firstFinisherEnds: false,     // play on for places
  autoRoll: false,              // if true, rolls happen automatically every N seconds
};
```

## State / actions

```ts
type SnakesState = { players: number; pos: number[] /* 0 = off board */; turn: SeatIndex; sixesInRow: number; finished: SeatIndex[]; over: boolean };
type SnakesAction = { type: "roll" };
```

Timeout action: `roll`. View: whole state (public).

## Events
`rolled{seat,d}`, `moved{seat,from,to}`, `ladder{seat,from,to}`, `snake{seat,from,to}`, `finished{seat}`.

## UI
- 10×10 SVG board drawn from data (snakes as smooth Bézier curves, ladders as rails), so presets need no artwork.
- Up to 8 tokens: distinct colour **and** shape/initial so they're readable when stacked.
- Animate square-by-square, then slide along snake/ladder.

## Bots
All levels just roll (it's luck). Bot "personality" only changes think time.

## Invariants
- `0 ≤ pos ≤ 100`; after a move nobody rests on a snake head or ladder foot.
- Game ends when all but one player have finished (or first finisher if `firstFinisherEnds`).
