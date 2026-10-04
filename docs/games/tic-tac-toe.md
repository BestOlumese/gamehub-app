# Tic-tac-toe

Players: exactly 2. Built first: it's the simplest way to prove the whole realtime stack end to end.

## Naija Standard preset

```ts
export const tttNaija: TttRules = {
  turnSeconds: 15,
  bestOf: 3,                 // 1 | 3 | 5
  alternateStarter: true,    // players swap who goes first each round
};
```

## State / actions

```ts
type TttState = {
  board: (0 | 1 | null)[];   // 9 cells, value = seat
  turn: SeatIndex;
  round: number;
  score: [number, number];
  draws: number;
  roundWinner: SeatIndex | "draw" | null;
  winLine: number[] | null;
  over: boolean;
};
type TttAction = { type: "place"; cell: 0|1|2|3|4|5|6|7|8 } | { type: "next_round" };
```

- Series ends when a player reaches `ceil(bestOf / 2)` round wins. If all rounds are played and scores are tied (draws), play sudden-death rounds until someone wins (cap 3 extra, then the series is a draw: both place 1).
- `next_round` auto-fires after 2.5 s (server alarm) so nobody waits.

Timeout action: Easy-bot move.

## Bots
- Easy: random empty cell, but takes an immediate win 50 % of the time.
- Medium: win if possible, block if needed, else centre > corner > edge.
- Hard: perfect minimax (never loses).

## Events
`placed{seat,cell}`, `round_won{seat,line}`, `round_draw`, `series_won{seat}`.

## UI
X/O drawn as SVG strokes with a 150 ms draw-on animation; win line animates across.
