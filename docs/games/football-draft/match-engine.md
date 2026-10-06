# Football Draft — match engine

A **deterministic, seeded** simulation in `packages/engine` (pure: no clock, no `Math.random`). Same inputs + same seed ⇒ the same match, every time. The output is an event list the client plays back as live text commentary with a stats ticker.

## Approaches we looked at

| Approach | Good at | Weak at | Use |
|---|---|---|---|
| **Poisson goal model** (each team's goals ~ Poisson(λ), λ from attack/defence strength; Dixon–Coles adds a low-score correction) | Realistic scorelines and draw rates with very little compute | No story: no shots, no players, no minute-by-minute | **Calibration target and sanity check** |
| **xG / shot model** (shots generated, each with an xG; goals = Bernoulli(xG)) | Shots, xG, believable "they had chances" stories | Needs a shot-rate model | **Core of our chances** |
| **Possession / event chain** (who has the ball, attacks, duels, outcomes) | Tactics and roles matter visibly; events for commentary | More parameters to calibrate | **Our outer loop** |
| Football Manager-style text engine | Presentation: commentary + key events, not a full 2D sim | — | **Presentation model** |

Sources: Dixon & Coles 1997 via penaltyblog docs and statsultra; match-statistics forecasting (arXiv 2001.09097) — `docs/research/sources.md`.

**Our engine = a per-minute possession/event loop that generates shots with xG; scorelines are then checked against Poisson-like targets by Monte Carlo tests.**

## Inputs
```ts
type MatchInput = {
  seed: string;                       // `${roomSeed}:match:${matchId}` — never sent to clients
  home: TeamSheet; away: TeamSheet;   // "home"/"away" only for display — no home advantage (neutral venue)
  knockout: boolean;                  // draws go to extra time and penalties
  rules: { chemistry: boolean; injuries: false };
};
type TeamSheet = {
  formation: FormationId;
  xi: Array<{ slot: number; player: PlayerCard; role: RoleId; focus: FocusId }>;
  bench: PlayerCard[];
  tactics: TeamTactics;               // tactics.md
  penaltyOrder?: PlayerId[];          // optional; default = best FIN first
};
```

Derived per team before each half: effective OVR per slot (penalties, familiarity, chemistry, fatigue), unit strengths **GK, DEF, MID, ATT** (`tactics.md` weights), and tactic multipliers.

## The loop (one half)
For each minute `m` of the half (45, plus 1–4 minutes of stoppage drawn from the RNG and raised by cards/subs):

1. **Possession.** `pA = MID_A^6 · tA / (MID_A^6 · tA + MID_B^6 · tB)` where `t` = product of the possession multipliers from tactics. (Exponent 6 → a 5-point midfield edge ≈ 56–57 % possession; tuned in tests.)
2. **Attack attempt.** The team in possession starts an attacking move with probability `0.30 × tempo × style` per minute. A move right after the other team's failed move is a **transition** (counter modifiers apply).
3. **Progress duel.** `P(progress) = σ((ATT_att − DEF_def) / 6 + tacticTerms)`. Failure → ball lost; with `p = 0.18` it was a **foul** (yellow card `p = 0.11` per foul, red `p = 0.004`; ball-winner/stopper roles foul more). Fouls in the final third can become **free kicks** (shot chance).
4. **Chance type** by tactics and roles: build-up chance, through ball (line height vs SPD), cross (width, POW), long shot, set piece (corners from blocked/saved shots and wide play; `p(corner) ≈ 0.35` per wide attack that fails late).
5. **Shooter** chosen by role weights (poacher, shadow striker, inside forward… `tactics.md`), assister likewise.
6. **xG** from the chance type's base (box ≈ 0.14, through ball ≈ 0.25, header ≈ 0.10, long shot ≈ 0.04, free kick ≈ 0.06, corner header ≈ 0.07), × quality `q = 1 + (ATT − DEF)/60`, × "players in box" factor; capped 0.02–0.65. **Offside** with `p = 0.08 × lineHeight/50` on through balls (chance cancelled).
7. **Outcome:** on target with `p = 0.35 + 0.25 × (FIN − 60)/40` (clamped 0.25–0.6); goal with `p = min(0.95, xG × (1 + (FIN − 75)/100) × (1 − (GK_STP − 75)/150)) / P(on target)` given on target; otherwise save / miss / block (blocked if defenders' DEF high and the shot central).
8. **Fatigue** update (`tactics.md`).

Events are emitted with a minute and a **sub-minute order** so the client can space them.

### Extra time and penalties (knockouts)
- Level after 90 → **extra time** 2 × 15 minutes with the same loop (fatigue carries over; one extra sub allowed at the break).
- Still level → **penalties**: 5 each, alternating, then sudden death. Takers: the manager's order or best FIN first (GK last).
  `P(score) = clamp(0.76 + 0.004 × (FIN − 75) − 0.003 × (GK_STP − 75) − (suddenDeath ? 0.03 : 0), 0.55, 0.92)`.
  > ⚠️ Unverified: the 0.76 base reflects the commonly quoted ~75–80 % penalty conversion; check against a primary source during calibration.

### Injuries
**Not in v1** (Proposal): they add frustration and RNG with little gain in a short draft game, and complicate subs. Fatigue covers "legs going". Can be added as a rule later.

## Output: event types
```ts
type MatchEvent =
  | { m: number; o: number; t: "kickoff" | "half_time" | "full_time" | "et_start" | "et_half" | "et_end" }
  | { m: number; o: number; t: "chance"; team: 0 | 1; kind: ChanceKind; player: PlayerId }
  | { m: number; o: number; t: "shot"; team: 0 | 1; player: PlayerId; assist?: PlayerId; xg: number; result: "goal" | "saved" | "missed" | "blocked" | "post" }
  | { m: number; o: number; t: "goal"; team: 0 | 1; player: PlayerId; assist?: PlayerId; score: [number, number] }
  | { m: number; o: number; t: "save"; team: 0 | 1; keeper: PlayerId }
  | { m: number; o: number; t: "corner" | "offside" | "free_kick"; team: 0 | 1; player?: PlayerId }
  | { m: number; o: number; t: "foul"; team: 0 | 1; player: PlayerId; card?: "yellow" | "red" | "second_yellow" }
  | { m: number; o: number; t: "sub"; team: 0 | 1; off: PlayerId; on: PlayerId }
  | { m: number; o: number; t: "pen"; team: 0 | 1; taker: PlayerId; scored: boolean; tally: [number, number] };

type MatchStats = { possession: [number, number]; shots: [number, number]; onTarget: [number, number];
                    xg: [number, number]; corners: [number, number]; fouls: [number, number];
                    yellows: [number, number]; reds: [number, number] };
```
A red card removes the player: his unit weights drop out (team plays with 10; possession and ATT/DEF recomputed).

## Calibration targets (CI Monte Carlo)

Real-world references (2024/25): **Premier League** ≈ 2.93–2.97 goals per match, **24.5 % draws** (home 40.8 / draw 24.5 / away 34.7), **26.1 shots per 90** for both teams (≈ 13 per team). Big-five goals per match from **2.56 (Serie A) to 3.14 (Bundesliga)**. Our matches are on a **neutral** ground (no home advantage), and draft teams are closer in quality than a league's top vs bottom, so draw rates sit at the league average or a little higher.

Test: **10,000 matches** between two auto-drafted Balanced teams with default tactics, and 10,000 per rating gap below. Fails CI if outside a band:

| Metric | Target band |
|---|---|
| Goals per match (equal teams) | **2.55 – 2.95** |
| Draw rate (equal teams, 90 min) | **22 – 29 %** |
| 0–0 rate | 5 – 10 % (⚠️ band from general football knowledge; verify with a league table during calibration) |
| Shots per team | **10.5 – 14.5** |
| Shots on target share | 30 – 40 % |
| Mean xG per shot | 0.09 – 0.13 |
| Possession, equal teams | mean 50 ± 1 %; 90 % of matches between 36 % and 64 % |
| Yellow cards per match | 2.5 – 4.5 |
| Red cards per match | 0.05 – 0.20 |
| **Win probability vs team-rating gap** (Proposal) | +0: 36–40 % each, draws 22–29 % · **+3: win 46–54 %** · **+5: win 55–64 %, draw 18–26 %** · **+10: win 72–84 %** · **+15: win 84–93 %** |
| Knockout: penalty shoot-out share of matches | 8 – 16 % |
| Same seed ⇒ identical event list | 100 % |

Why these gap targets: they keep the draft meaningful (a better team usually wins) while leaving real upsets, roughly matching bookmaker odds between clearly unequal top-flight sides. They are Proposals to be confirmed by Best after the first calibration run.

Tuning knobs (in this order): attack rate (0.30), progress-duel scale (/6), xG bases, conversion constants, possession exponent (6). The final constants and results are logged in this file's tuning log.

## CPU and persistence plan
- A half is ~50 loop iterations with a handful of RNG draws each → **well under 1 ms** of CPU; a whole match including extra time and penalties < 2 ms. Fits the 10 ms Free limit with large headroom (`13-free-tier-budget.md`; confirm with the benchmark).
- **Simulate each half in one invocation**, at its kickoff (the first half at kickoff, the second when the half-time window closes, extra time after its break). Subs/tactics from half-time are inputs to the next half.
- **Persist only:** the half's compact event log (tuples, ≈ 1.5–3 KB per half) and the running score/stats — at kickoff, at the start of the second half (and of extra time), and at full time. **No row writes per event.** Playback timing is a client concern (below).
- **Per match ≈ 3–4 row writes + 2–4 alarm writes** (half-time window, end of playback). See `modes.md` for per-mode totals.

## Presentation
- **Playback:** each half plays over **40 s** of real time (Proposal; extra-time halves 15 s), i.e. ≈ 0.9 s per match minute. The server sends the half's event list with `startedAt` (server time) as soon as it's simulated; the client reveals each event when `serverNow() ≥ startedAt + offset(m, o)`. Full match ≈ 80 s + 40 s half-time window.
- **Reconnect:** the client receives the same list and `startedAt` in the snapshot and jumps straight to the current minute (events before "now" render instantly).
- **No spoilers:** the second-half list isn't sent before the second half starts (it doesn't exist yet), and a half's list is sent at its start — a modified client could peek ahead **within the current half** only. Accepted: there are no live decisions during a half, so peeking gives no advantage.
- **Quick sim** (viewer toggle): show the half's result immediately. In head-to-head rooms the half-time window still opens at the normal time for everyone (server time), so quick-simming saves nothing but suspense. In a **solo run**, "Skip" ends playback for real (the server advances immediately — no other human to wait for).
- **Ticker:** score, minute, possession %, shots (on target), xG, corners, cards — updated as events reveal.
- **Commentary:** template lines (below), one per event, plain lively English with occasional Naija flavour, never insulting. Big moments (goal, red card, penalty miss, full time) get a larger card and a sound.

### Commentary templates (starter set; `{player}`, `{team}`, `{keeper}`, `{m}`)
| Event | Lines (one picked by the seeded RNG) |
|---|---|
| goal | "GOAL! {player} finishes it off. {score}." · "{player} buries it! {team} lead." · "Omo! {player} has done it again!" · "Header in! {player} rises highest." (headers only) |
| shot saved | "Big save from {keeper}!" · "{keeper} says no to {player}." · "No wahala for {keeper}, held comfortably." |
| shot missed | "{player} drags it wide." · "Over the bar from {player}." · "Chance gone. {player} will want that one back." |
| post | "Off the post! {player} so close." |
| chance | "{team} break forward…" · "Lovely ball in behind for {player}…" |
| corner | "Corner to {team}." |
| offside | "Flag's up. {player} went too early." |
| foul | "Free kick. {player} catches him late." |
| yellow | "Yellow card for {player}." |
| red | "RED CARD! {player} is off. {team} down to ten." |
| sub | "Change for {team}: {on} comes on for {off}." |
| half time | "Half time. {score}." |
| full time | "Full time! {score}." · "That's it! {team} take it." |
| penalties | "{player} steps up… scores!" · "{player}'s penalty is saved by {keeper}!" |

Templates live in the engine (so commentary is part of the deterministic output, testable for banned words).

## Tests
- Monte Carlo bands above (CI, 10,000 matches each; seeded so failures reproduce).
- Determinism (same input ⇒ same events and stats).
- Invariants: score equals the count of goal events; stats equal event counts; 11 players per side minus reds; subs ≤ 5 (+1 in ET); no event references a player not on the pitch; penalties alternate correctly and end at the right time.
- Tactics sanity tests: long ball increases direct attacks; high line + opponent pace increases through-ball chances; chemistry off removes its effect; out-of-position penalties applied.
- Commentary: every template renders; banned-word list check.
