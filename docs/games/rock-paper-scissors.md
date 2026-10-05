# Rock Paper Scissors

Players: 2–8.
- 2 players: **best-of-3 duel**.
- 3–8 players: **knockout bracket**, every match best-of-3.

## Simultaneous, hidden picks

The only game where several seats act at once. Picks are hidden until everyone in the match has thrown (or the timer expires), then revealed together.

- Server stores picks; `view` shows each player only **whether** others have thrown, never what — until reveal.
- No commit–reveal crypto needed: the server is trusted and never leaks picks.

## Naija Standard preset

```ts
export const rpsNaija: RpsRules = {
  turnSeconds: 10,
  bestOf: 3,          // per match: 1 | 3 | 5
  maxTiesPerRound: 5, // after 5 consecutive ties in one throw, decide by server coin flip
};
```

## Knockout bracket (3–8 players)

- Seed bracket randomly (server RNG). Size = next power of two (4 or 8); top seeds get **byes** to fill.
- All first-round matches run **in parallel** (each player only acts in their own match); spectating players (eliminated or bye) watch the live match list.
- Winners advance; next round starts when all matches of the current round finish.
- Final places: winner 1st, final loser 2nd, semi-final losers tie 3rd, quarter-final losers tie 5th.

## State / actions

```ts
type RpsState = {
  players: number;
  bracket: Array<Array<{ a: SeatIndex | null; b: SeatIndex | null; score: [number, number]; ties: number;
                          picks: Partial<Record<SeatIndex, Throw>>; winner: SeatIndex | null }>>;
  round: number;
  eliminated: Array<{ seat: SeatIndex; round: number }>;
  revealUntil: number | null;     // brief pause showing both throws (2 s)
  over: boolean;
};
type Throw = "rock" | "paper" | "scissors";
type RpsAction = { type: "throw"; pick: Throw };
```

`currentSeats` returns every seat in an unfinished match that hasn't thrown yet.
Timeout action: random throw (server RNG) for each seat that hasn't thrown.

## Bots
- Easy: uniform random.
- Medium: slight bias to counter the opponent's most frequent throw in this match.
- Hard: frequency + "win-stay / lose-shift" model of the opponent's last throws (only from revealed throws).

## Events
`threw{seat}` (no pick), `revealed{match, picks, result}`, `match_won{seat}`, `round_started{round}`, `champion{seat}`.

## UI
Big three-button picker; after throwing, your choice is shown, the opponent's card is face-down with a "thrown" tick. Reveal: simultaneous flip.

## As built (Phase 3)

- **No server reveal pause.** `revealUntil` was dropped: a throw is revealed the moment both picks are in and the next throw's timer starts. The client plays "Rock… Paper… Scissors… Shoot!" (~0.9 s) and holds the flipped cards (~1.4 s) before the picker comes back. This keeps parallel bracket matches independent of each other and needs no per-match clock in the engine.
- State keeps every revealed throw per match in `history` (bots read only this). Pending `picks` exist only in server state; `view()` turns them into `thrown: SeatIndex[]` plus the viewer's own `mine`.
- Places come from `rpsPlaces()` (shared by the server ranking and the podium UI): champion, final loser, then losers grouped by the round they went out in.
- Room setup asks for the player count first (2 = duel, 3–8 = knockout). For knockouts, "Fill empty seats with bots when I start" tops up the bracket at Start; in duels, "Play a bot" seats the bot immediately.
- Bots: Easy uniform; Medium counters the opponent's most frequent revealed throw 60 % of the time; Hard models win-stay / lose-shift with 20 % noise.
