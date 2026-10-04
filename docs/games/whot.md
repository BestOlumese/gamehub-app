# Whot (Naija rules)

Players: 2–8. Shedding game: first to empty your hand wins.

## Deck — 54 cards (Nigerian standard pack)

| Shape | Numbers | Count |
|---|---|---|
| Circle | 1 2 3 4 5 7 8 10 11 12 13 14 | 12 |
| Triangle | 1 2 3 4 5 7 8 10 11 12 13 14 | 12 |
| Cross | 1 2 3 5 7 10 11 13 14 | 9 |
| Square | 1 2 3 5 7 10 11 13 14 | 9 |
| Star | 1 2 3 4 5 7 8 | 7 |
| Whot | 20 (×5) | 5 |

Card id: `"{shape}-{number}"` plus index for Whot (`"whot-20-a"`…`"whot-20-e"`). Star cards score double when counting.

## Special cards (Naija Standard)

| Card | Name | Effect |
|---|---|---|
| 1 | Hold on | You play again immediately (any matching card). |
| 2 | Pick two | Next player picks 2 from market, unless they defend. |
| 5 | Pick three | Next player picks 3, unless they defend. |
| 8 | Suspension | Next player is skipped (2 players: you play again). |
| 14 | General market | Every other player picks 1; you play again. |
| 20 | Whot | Wild; you request a shape. Next player must play that shape (or another Whot), or pick 1. |

## Turn flow

1. Deal `handSize` cards each (default 6). Flip the top card of the market as the call card.
   - If the first call card is special, it has **no effect** (default) — config `firstCardEffect: "none" | "apply"`. If it's a Whot, the first player may play any shape.
2. On your turn: play one card matching the call card's **shape or number**, play a Whot, or **go to market** (pick 1, turn ends).
3. Pending penalty (pick 2/3 chain): you must either defend (stack) or pick the accumulated total. Whot cannot be played onto a pending penalty.
4. When you drop to **1 card**, you must declare "Last card" (action `declare_last_card`) **before the next player acts**. If you don't, the next player's action triggers your penalty: pick 2 (`lastCardPenalty`, default 2).
5. Win: play your last card. If `checkUpRequired` is on, the final play must be accompanied by "Check up" (one-tap combined action); otherwise auto.

## Naija Standard preset (your choices)

```ts
export const whotNaija: WhotRules = {
  turnSeconds: 30,
  handSize: 6,                       // 3–8
  holdOn: true,                      // 1
  pickTwo: true,                     // 2
  pickThree: true,                   // 5
  suspension: true,                  // 8
  generalMarket: true,               // 14
  stackPenalties: true,              // defend 2 with 2, 5 with 5; penalty accumulates
  crossStack: false,                 // defend 2 with 5 or vice versa (off)
  mustDeclareLastCard: true,
  lastCardPenalty: 2,
  checkUpRequired: false,
  canFinishOnSpecial: true,          // winning card may be 1/2/5/8/14/20
  marketExhausted: "count",          // "count" | "reshuffle"
  firstCardEffect: "none",
  multiWinner: "rankByCount",        // after first finisher: "rankByCount" | "playOn"
};
```

All fields customizable per private room (lobby rules sheet).

### Effects of options
- `canFinishOnSpecial: false` → if your last card is special, you must pick 1 instead of playing it ("You can't finish on a special card").
- `marketExhausted: "count"` → game ends immediately; lowest hand total wins (stars ×2, Whot = 20); ties share place.
- `marketExhausted: "reshuffle"` → discard pile (except top card) is shuffled into a new market. If still empty, fall back to `count`.
- `multiWinner: "rankByCount"` (default) → game ends when first player finishes; others ranked by hand total (lowest first). Fast, good for ranked.
- `multiWinner: "playOn"` → play continues until one player remains; places in finishing order.

## State

```ts
type WhotState = {
  players: number;
  hands: string[][];              // by seat
  market: string[];               // top = end
  pile: string[];                 // discards, top = end
  callShape: Shape | null;        // requested shape after a Whot
  turn: SeatIndex;
  direction: 1;                   // fixed (no reverse in Naija Standard)
  pendingPick: { amount: number; kind: 2 | 5 } | null;
  lastCardDeclared: boolean[];
  lastCardDue: SeatIndex | null;  // seat who hit 1 card without declaring
  finished: SeatIndex[];
  over: boolean;
};
```

## Actions

```ts
type WhotAction =
  | { type: "play"; card: string; requestShape?: Shape }   // requestShape required for Whot
  | { type: "market" }                                      // draw 1 (or accept pending penalty)
  | { type: "declare_last_card" };                          // allowed any time you hold exactly 1 card (or are about to: client can send after play)
```

Timeout action: `market`.

## View

```ts
type WhotView = {
  you: { hand: string[] } | null;                  // null for spectators
  counts: number[];                                // cards per seat
  top: string; callShape: Shape | null;
  marketCount: number;
  turn: SeatIndex; pendingPick: { amount: number } | null;
  lastCardDeclared: boolean[];
  finished: SeatIndex[]; over: boolean;
};
```

## Events (animation/sound)
`dealt`, `played{seat,card}`, `went_market{seat,count}`, `pick_two`, `pick_three`, `hold_on`, `suspension`, `general_market`, `whot{shape}`, `last_card{seat}`, `penalty{seat,count,reason}`, `finished{seat}`.

## UI notes
- Hand fanned along the bottom, playable cards lifted 6px, unplayable dimmed (not hidden).
- "LAST CARD" button appears and pulses when you hold 2 cards and it's your turn (so you can declare as you play), and stays visible while you hold 1.
- Whot shape picker: 5 big shape buttons, appears after dropping a Whot.
- Market tap = pick. Pending penalty shows on the market: "Pick 4" with a defend hint.

## Bots
- Medium: if pending penalty → defend if possible; else prefer specials that hurt the next player when they have ≤ 3 cards; keep Whot for last; request the shape you hold most of.
- Hard: Medium + tracks played cards to estimate which shapes opponents lack; times "General market" when opponents are low.

## Invariants (property tests)
- Total cards across hands + market + pile = 54 always.
- No duplicate card ids.
- `pendingPick` only exists if the top card is 2 or 5.
- A seat with 0 cards is in `finished`.
