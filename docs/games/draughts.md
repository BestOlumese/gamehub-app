# Draughts ("draft")

Players: exactly 2. Two variants, both ours (no third-party engine):

| Variant | Board | Pieces | Default for |
|---|---|---|---|
| **Naija draft** (`naija10`) | 10×10, dark squares only | 20 each ("seeds") | Private rooms, quick-match |
| **English checkers** (`english8`) | 8×8 | 12 each | Option |

Sources: `docs/research/sources.md` → "Draughts".

## What Nigerians actually play (research findings)

| Question | Finding | Sources | What we do |
|---|---|---|---|
| Name | "Draft", pieces are "seeds"; crowning by putting a captured seed on top | draftstechniques.com, fateround.com | UI says **Draft**, pieces **seeds**, king shown as a stacked seed |
| Board size | 10×10, 20 seeds each, dark squares | all sources | `naija10` |
| **Orientation** | Nigerian/Ghanaian "mirrored" board: the long diagonal ("central line") is on each player's **right**; FMJD has the dark corner square on each player's **left** | draftstechniques.com (rules page), worldmindgames.net | `orientation: "naija"` (mirrored) default; `"fmjd"` option. Square numbering follows the orientation so notation still reads 1–50 from the top player's side |
| Who moves first | "Lots are drawn" (Nigerian club rules); FMJD: light/white first; one low-quality blog says black first | draftstechniques.com, Wikipedia, wixsite blog | `firstMove: "random"` default (server coin flip = drawing lots); options `"light"`, `"dark"` |
| Men capture backward | Yes | all reliable sources | `menCaptureBackward: true` (option off) |
| Flying kings | Yes | all sources | `flyingKings: true` (option off = kings move one square) |
| Capture compulsory | Yes | all sources | `captureRule` never allows "no capture" except with the huffing option |
| **Majority capture** | **Sources disagree.** fateround.com (an online Nigerian-draft site) enforces "take the most"; draftstechniques.com (Nigerian club rule books) says the mirrored African version uses **free choice** — "the capture of the largest number of pieces is NOT obligatory" — while FMJD uses majority | fateround.com vs draftstechniques.com | **Default `free`** (Best chose free choice, Oct 2026, matching club play); `majority` option for FMJD-style play |
| Promotion mid-capture | Only if the move **ends** on the back row (passing through doesn't crown) | fateround.com, FMJD | `promoteOnlyAtEnd: true` |
| Turkish strike | Captured seeds are removed after the whole sequence; a seed can't be jumped twice | FMJD / Wikipedia | Always on in `naija10` |
| Huffing (blowing a seed that failed to capture) | Not mentioned for Nigeria; associated with Malaysian/Singaporean play; Ghana forfeits a king that misses a capture | search summaries | `missedCapture: "forced"` default (the app forces captures, so there's nothing to huff); `"huff"` option (below) |
| Draws | 25-move rule mentioned by fateround; FMJD adds the 16/5-move endgame rules and threefold | fateround.com, lidraughts/playstrategy summaries | FMJD draw set (below) |

> ⚠️ Unverified: there is no single written Nigerian federation rulebook online. Defaults follow the most specific Nigerian sources; every point above is a rule option.

## Rules — `naija10` (Naija Standard)

- **Setup:** 10×10, seeds on the dark squares of each player's four nearest rows; two empty middle rows. Board shown in the mirrored Nigerian orientation.
- **First move:** decided by lot (server RNG).
- **Men** move one square diagonally forward; **capture** by jumping an adjacent enemy piece diagonally **forward or backward** onto the empty square beyond.
- **Kings** (crowned only when a move ends on the far row) **fly**: move any distance along an open diagonal; capture an enemy piece at any distance on a diagonal if every square between is empty and at least one empty square lies beyond; may land on any empty square beyond it.
- **Capture is compulsory.** A sequence continues while another capture is possible from the landing square, changing direction freely.
- **Majority rule:** of all legal sequences, you must play one that captures the **most pieces** (men and kings count the same, FMJD). Free-choice option: any legal sequence, but it must be played to its end.
- **Turkish strike:** captured pieces stay on the board until the sequence ends (they block, and can't be jumped twice), then are removed together.
- **Win:** opponent has no pieces or no legal move.

## Rules — `english8`

- 8×8, 12 men each, dark squares, **dark moves first** (single corner on each player's left — standard checkers board).
- Men move and capture **forward only**; kings move and capture **one square** in any diagonal direction.
- Capture compulsory; **free choice** among capturing sequences, but the chosen one must be completed.
- A man reaching the king row (by a move or a jump) is crowned and **the move ends**.
- Captured pieces are removed as they are jumped (no Turkish strike needed — a piece can't be met twice when kings move one square).

## Draw rules

| Variant | Rule | Source |
|---|---|---|
| `naija10` | Threefold repetition (same position, same side to move) | FMJD / Wikipedia |
| `naija10` | **25-move rule:** 25 consecutive moves by each player with only king moves — no man moves, no captures | FMJD / fateround |
| `naija10` | **16-move endgame:** one side has a lone king v 3 pieces including at least one king → draw after 16 moves each | FMJD (lidraughts/playstrategy) |
| `naija10` | **5-move endgame:** lone king v ≤ 2 pieces including at least one king → draw after 5 moves each | FMJD |
| `naija10` | King v king → immediate draw | Wikipedia |
| `english8` | Threefold repetition | standard |
| `english8` | **40-move rule (online form):** 40 moves by each player with no capture and no man move → draw. The official rule is "after a refused draw offer, show a win within 40 moves"; with no arbiter we apply it automatically | playstrategy/Wikipedia; adaptation is ours |
| both | Agreement (`offer_draw` / `accept_draw`, same limits as chess) | — |

All draw rules are automatic (same reasoning as chess: no arbiter, phones). `drawRules: "standard" | "none"` option turns off the move-count rules for casual play (repetition and agreement stay).

## Huffing option (`missedCapture: "huff"`)
When on, captures are **not** forced by the app. If a player makes a non-capturing move while a capture was available, the opponent may, at the start of their own turn, **huff**: remove the piece that could have captured (if several could, they choose one) and then play normally. Huffing is optional and free (no turn spent). Majority/free choice still decides *which* capture counts as "available". Off in Naija Standard.

## Notation
- Squares numbered **1–50** (`naija10`) and **1–32** (`english8`) row by row from the top player's side (standard numbering; mirrored orientation numbers from the mirrored corner).
- Moves: `32-28`; captures: `28x19x10` (every landing square listed, so a flying-king path is unambiguous). Move list in two columns.

## Majority-capture algorithm

```ts
// Board: Int8Array(50|32): 0 empty, ±1 man, ±2 king (sign = side). Precomputed neighbour tables per square per direction.
type Seq = { from: number; path: number[]; captured: number[] };

function captures(b: Board, side: 1 | -1, r: Rules): Seq[] {
  const all: Seq[] = [];
  for (const sq of pieces(b, side)) dfs(b, sq, sq, [], [], all, r);
  if (!all.length) return [];
  if (r.captureRule === "majority") {
    const best = Math.max(...all.map((s) => s.captured.length));
    return all.filter((s) => s.captured.length === best);
  }
  return all; // free choice: any complete sequence
}

// Turkish strike: `taken` pieces stay on the board (they block) but can't be jumped again.
function dfs(b, start, at, path, taken, out, r) {
  let extended = false;
  for (const dir of DIRS) {
    if (isMan(b[start]) && !r.menCaptureBackward && !forward(dir, b[start])) continue;
    for (const { over, landings } of jumpsFrom(b, at, dir, isFlyingKing(b[start], r), start)) {
      if (taken.includes(over)) continue;             // can't jump the same piece twice
      for (const land of landings) {                   // flying kings may land on any empty square beyond
        extended = true;
        dfs(b, start, land, [...path, land], [...taken, over], out, r);
      }
    }
  }
  if (!extended && taken.length) out.push({ from: start, path, captured: taken });
}
```

- `jumpsFrom` treats the moving piece's own start square as **empty** (it has left it) and squares of `taken` pieces as **occupied**.
- Men never crown mid-sequence in `naija10`; in `english8` the sequence stops when a man reaches the king row.
- Duplicate sequences (same `from`, same final square, same captured set by a different route) are merged so the UI offers each distinct outcome once; the player picks the landing squares hop by hop and the UI disambiguates only when needed.
- Cost: worst case is a flying king in a crowded mid-game; the DFS is bounded by 20 enemy pieces and 4 directions. Typical positions evaluate in microseconds; a benchmark position set (`12-testing.md`) guards it.

## Clocks
Reuses the chess clock system (`chess.md`: server time, lichess-style lag quota, flag alarm, premoves off by default for draughts). Presets: No clock (private default, with `moveLimitSeconds` like chess), 3+2, **5+3 (quick-match default — proposal)**, 10+5, 15+10. Categories for ratings are **not** split by speed (one rating per variant, see `08-matchmaking-ratings.md`).

## Naija Standard preset and RuleConfig

```ts
export type DraughtsRules = {
  turnSeconds: number;                              // RuleConfigBase; per-move limit when there's no clock
  variant: "naija10" | "english8";
  orientation: "naija" | "fmjd";                    // naija10 only
  firstMove: "random" | "light" | "dark";
  menCaptureBackward: boolean;                      // naija10 default true; english8 fixed false
  flyingKings: boolean;                             // naija10 default true; english8 fixed false
  captureRule: "majority" | "free";                 // naija10 default free (Best, Oct 2026); english8 fixed free
  missedCapture: "forced" | "huff";
  drawRules: "standard" | "none";
  timeControl: { baseSeconds: number; incrementSeconds: number } | null;
  moveLimitSeconds: number;                         // 60–900, no-clock games
  takebacks: boolean;                               // private only, like chess
};

export const draughtsNaija: DraughtsRules = {
  turnSeconds: 60,
  variant: "naija10",
  orientation: "naija",
  firstMove: "random",
  menCaptureBackward: true,
  flyingKings: true,
  captureRule: "free",
  missedCapture: "forced",
  drawRules: "standard",
  timeControl: null,          // private rooms: no clock
  moveLimitSeconds: 300,
  takebacks: true,
};

export const englishPreset: DraughtsRules = {
  ...draughtsNaija,
  variant: "english8", firstMove: "dark", menCaptureBackward: false, flyingKings: false, captureRule: "free",
};
```

Choosing `english8` locks the variant-fixed fields (the rules sheet shows them read-only).

## As built (Phase 8, Oct 2026)
- Code: `packages/engine/src/games/draughts/` — `board.ts` (geometry, move generation on an `Int8Array`, square − 1 indexed; ±1 man, ±2 king, + = light), `core.ts` (browser-safe: legal moves, draw counts, clocks, layout, PDN), `bots.ts`, `service.ts` (Hard, for the bot service), `index.ts` (the `GameDefinition`).
- Colours: light seeds are **red** caps, dark ones **green** (`11-design-system.md`). Light starts on the high numbers (31–50 / 21–32) at the bottom and moves up; dark on 1–20 / 1–12.
- "Who goes first" (the room setting) picks the **seat**; `firstMove` picks the **colour** that seat plays (random by default; English: always dark).
- State differs from the sketch below: no `pending` (the client sends the whole path), no `counters` or `positions` map. `history` holds every position as text (one character a square: `.lLdD`), and every draw count (quiet moves, repetitions, endgame moves) is read back from it, so takebacks need nothing else. `moves` holds `{from, path, captured}` (1-based).
- A huff replaces the current position in `history` (no new ply); `huffable` is cleared on takebacks.
- Bots always capture when they can (even with huffing on) and huff when allowed (a king first). Easy: 1,000 positions, two moves ahead, material only, slips 1 in 4. Medium: 3,000 positions, up to four moves ahead plus captures, positional eval. Measured ~1.5–3 µs a position in Node (p95 ≈ 1 ms Easy, ≈ 5 ms Medium); confirm on Cloudflare in Phase 16.
- Hard: `15-bot-service.md`.

## State, actions, view, events

```ts
type DraughtsState = {
  variant: "naija10" | "english8";
  board: number[];                  // 50 or 32 squares; 0, ±1 man, ±2 king (+ = seat 0)
  seats: [SeatIndex, SeatIndex];    // [light, dark]
  turn: 0 | 1;                      // index into seats
  ply: number;
  pending: { from: number; path: number[] } | null; // a multi-hop capture being entered hop by hop (UI convenience; server also accepts a full path)
  huffable: { seat: SeatIndex; squares: number[] } | null;
  counters: { kingOnlyMoves: number; noProgress: number; endgameMoves: number | null };
  positions: Record<string, number>; // repetition map since the last man move or capture
  clock: ChessLikeClock | null;     // same shape as chess
  drawOffer: { by: 0 | 1 } | null;
  result: { winner: 0 | 1 | null; reason: DraughtsEndReason } | null;
};

type DraughtsAction =
  | { type: "move"; from: number; path: number[]; mt?: number } // path = landing squares; one entry for a simple move
  | { type: "huff"; square: number }
  | { type: "resign" } | { type: "offer_draw" } | { type: "accept_draw" } | { type: "decline_draw" }
  | { type: "request_takeback" } | { type: "accept_takeback" } | { type: "decline_takeback" };

type DraughtsView = DraughtsState & { you: 0 | 1 | null; legal?: Array<{ from: number; path: number[] }> };
```

No hidden information: `view` is the state plus the viewer's legal moves.

Events: `moved{from, path}`, `captured{squares}` (after the sequence — Turkish strike), `crowned{square}`, `huffed{square}`, `draw_offered`, `game_over{winner, reason}`.

Timeout action: in no-clock games, the first legal move from the Easy bot; with a clock, the flag decides.

## Bots (all our own TypeScript)

| Level | Where | Search |
|---|---|---|
| Easy | DO | Depth-2 alpha-beta, material only (man 100, king 300), random tie-breaks; node budget 1,000 |
| Medium | DO | Depth-4 alpha-beta + quiescence on captures, eval: material, advancement, back-row guard, centre control, king mobility; node budget 6,000 (fits ≤ 5 ms target — confirm with the CPU benchmark) |
| Hard | Bot service (`15-bot-service.md`, `/api/bots/draughts/move`) | Iterative deepening to 150 ms, transposition table, same eval with tuned weights; falls back to Medium on any failure |

Node budgets instead of time limits because `Date.now()` doesn't advance during CPU work in Workers.

## UI notes
- SVG board, 10×10 or 8×8, our board colours (`11-design-system.md`): dark squares `--draught-dark`, light `--draught-light`.
- Seeds: flat discs (cream `#F4EBD9` with ink rim, and ink `#2B2D31` with cream rim); king = two stacked discs (offset 3 px) with a small crown mark — readable without colour.
- Tap a seed → legal destinations dotted; multi-captures: tap each landing square in turn; when majority applies, only sequences of the maximum length are offered and a hint reads "You must take 3".
- Captured seeds fade out together at the end of the sequence (Turkish strike made visible).
- Board turned so your seeds are at the bottom; mirrored orientation shown with a small "Naija board" label.
- Move list in standard notation; FEN-like position copy (PDN FEN) and PDN export.
- Screen readers: "Seed 32 to 28", "Capture 28 takes 23, lands 19".
- Clock, draw offer, takeback and claim UI shared with chess.

## Invariants
- Piece counts never increase; a side's count drops only by captures.
- No man on its own crowning row at the end of a turn (it would have been crowned) — except `naija10` men that passed through mid-capture and ended elsewhere.
- After a capture sequence, removed pieces = `captured` of the chosen sequence; under `majority`, its length is the maximum available.
- Repetition map cleared on man moves and captures.

## Tests
- **Capture edge cases** (example tests, both variants): flying-king long captures with several landing squares; majority choosing between a 2-capture by a man and a 3-capture by a king; Turkish strike blocking (a taken piece blocks a later hop); a man passing the crowning row mid-capture (not crowned); `english8` man jumping into the king row stops; men capturing backward on/off; free vs majority.
- **Promotion edge cases:** crowned only at end; king immediately capturing next turn.
- Draw rules: 25-move, 16/5-move endgames, 40-move english, threefold.
- Huffing flow.
- **Perft-style counts** for start positions (move-generation correctness) compared against a second, naive generator in tests.
- Properties (≥ 1,000 runs): random games terminate (draw rules guarantee it; bound 600 plies), illegal moves rejected, determinism, every legal sequence obeys the capture rule.
- Bots legal; Hard beats Easy > 60 % (1,000 games, short time budget in tests).

## Free-tier cost per game
≈ 60–100 plies → **≈ 100–150 rows** (same pattern as chess). Unclocked private games cost ~1 row per move.
