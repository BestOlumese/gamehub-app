# Snakes & Ladders

Players: 2–8. Pure luck. First to reach square 100 wins.

## Boards

Choice: **our own four hand-designed boards**, the room picks one (decided with Best, Oct 2026). Drawn from data in `packages/engine/src/games/snakes/boards.ts`, so they need no artwork.

We **don't ship the 1943 Milton Bradley layout**. We checked it (39.2 expected solo rolls, matching Althoen et al. 1993), but a copied layout is a trade-dress risk for no gain (see `concerns.md` #12).

| Board | Ladders (bottom → top) | Snakes (head → tail) | Solo expected rolls | 4p median rounds (play on) | 8p median rounds to first finish |
|---|---|---|---|---|---|
| `naija-classic` (default) "Naija Classic": the traditional feel | 3→22, 8→30, 17→44, 26→47, 33→52, 49→71, 58→77, 69→88, 78→96 | 19→6, 31→12, 46→25, 54→34, 63→45, 84→64, 91→70, 94→75, 98→79 | 36.9 | 32 | 14 |
| `quick` "Quick": more ladders, shorter games | 2→18, 6→27, 15→38, 24→51, 36→62, 42→65, 53→79, 60→84, 71→93 | 29→11, 44→16, 47→30, 58→39, 68→52, 77→55, 86→66, 95→72 | 31.4 | 27 | 13 |
| `lagos-traffic` "Lagos Traffic": long snakes near the top | 4→25, 13→46, 21→42, 33→57, 50→68, 62→81, 70→87, 74→92, 79→98 | 27→9, 56→35, 85→64, 89→53, 93→16, 97→61, 99→58 | 57.3 | 47 | 14 |
| `balanced` "Balanced": ladders and snakes cancel out | 5→26, 12→31, 28→50, 40→59, 52→73, 66→85, 77→94 | 23→4, 37→18, 48→29, 61→42, 75→56, 88→69, 96→78 | 35.9 | 32 | 15 |

Numbers are from 10,000 simulated games under Naija Standard (exact finish, 6 rolls again, 3 sixes forfeit).

Every board must pass the simulation test in `snakes.test.ts`:
- 10,000 random 4-player games, median length 25–60 rounds, all finish.
- No snake head on a ladder foot, and nothing on 1 or 100.
- No chains (a jump never lands on another jump).

**Pace:** a bot turn takes about 2.5 s (think 0.5–0.9 s, die 0.9 s, 110 ms a hop, 0.25 s settle, 0.7 s slide). An 8-player game on Quick with "first to 100 ends it" runs about 5–6 minutes in the E2E test.

## Naija Standard preset

```ts
export const snakesNaija: SnakesRules = {
  turnSeconds: 15,              // short: the only action is "roll"
  board: "naija-classic",
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
type SnakesState = {
  players: number; board: BoardId; pos: number[] /* 0 = off board */; turn: SeatIndex; sixesInRow: number;
  lastRoll: { seat: SeatIndex; value: number } | null; finished: SeatIndex[]; over: boolean; places: SeatIndex[][] | null;
};
type SnakesAction = { type: "roll" };
```

Timeout action: `roll`. View: whole state (public).

## Events
`rolled{seat,d}`, `moved{seat,from,to,path}` (`path` = every square hopped, so the client animates exactly what the server did), `ladder{seat,from,to}`, `snake{seat,from,to}`, `bumped{seat,victim,from}`, `finished{seat}`. A six forfeit and a roll that overshoots are a `rolled` with no `moved`.

Bot turns are chained (`chainTurns`): a bot's roll, its bonus rolls and the next bot's turns arrive as one write; `eventPauses` (rolled 900 ms, moved 110 ms a hop + 250 ms, ladder/snake 700 ms) space them out on the server so the client can play them back at human speed.

## UI (decided with Best, Oct 2026)
- **Layout:** every player in a row on top (4 per row, 2 rows for 5–8; never cut off), the board full width under it, a status line, then your panel with the big die at the bottom. No separate turn banner: "Your turn" shows in your panel, anyone else's turn in the status line (keeps the die on screen on 360 × 640 phones). The board shrinks with the screen height if needed.
- **Player chips:** avatar with timer ring (people) or thinking arc (bots), their shape-and-colour badge, name, "Sq 34" (or place). The playing chip has an amber border.
- **Board (soft and light, like Ludo):** rounded tiles in gentle colour bands, small grey numbers, a gold star on 100, warm wooden ladders, friendly tapered snakes with belly spots and eyes.
- **Tokens:** pin markers. The pin head is the player's **shape** (circle, triangle, square, diamond, star, hexagon, cross, pentagon) in their colour with their **initial** inside, so 8 players stay readable when stacked. Tokens on one square fan out; yours bobs when it's time to roll.
- **Playback:** the board freezes at the position before a turn; the die tumbles, the token hops square by square, then slides up the ladder or down the snake's curve (`playback.ts`, tested). Message line: "Bot 2 climbed a ladder: 6 → 27", "You got bitten: 95 → 72", "You rolled a 6", "Three sixes. Your turn is over".
- **Die:** your die keeps your last roll, faded until it's your go; it pulses amber when you can roll.
- **Rules step:** four board cards with small previews (no numbers) and the board's one-line blurb, then the toggles.
- **Results:** every place with the player's shape badge and final square ("Home" for 100).
- **Accessibility:** a screen-reader list gives every player's square.

## Bots
All levels just roll (it's luck). Bot "personality" only changes think time.

## Invariants
- `0 ≤ pos ≤ 100`; after a move nobody rests on a snake head or ladder foot.
- Termination: every game ends within 6,000 rolls (property test; long games with 8 players and exact finish can pass 3,000).
- Game ends when all but one player have finished (or first finisher if `firstFinisherEnds`).
