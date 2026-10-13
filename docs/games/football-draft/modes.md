# Football Draft — modes

Three ways to play, all **unranked** (no rating; only match history and a solo-run record). No rewards of any kind — nothing to win but bragging rights.

## 1. Room head-to-head (2–8 managers)
Everyone drafts **at the same time and privately** (`draft.md`), arranges their team, then:

| Managers | Format | Default |
|---|---|---|
| 2 | **Single match** · or **best of 3** (decided with Best, Oct 2026: the host picks, single by default; same drafted teams, tactics/lineup editable between matches; decider match is a knockout with extra time + penalties) | Single match |
| 3–8 | Host picks **mini league** (round robin) or **knockout** | League for 3–5, knockout for 6–8 |

### Mini league
- Round robin by the circle method: `N − 1` rounds (N even) or `N` rounds with one bye per round (N odd). Every manager plays one match per round; **all matches of a round run at the same time** (same playback clock), so 8 managers take 7 rounds ≈ 7 × ~2.5 min ≈ 18 minutes.
- Points 3 / 1 / 0; draws allowed (no extra time).
- **Table order:** points → goal difference → goals scored → head-to-head points → head-to-head goal difference → server coin flip (seeded). Shown live.
- Between rounds: 30 s to change lineup/tactics (same rules as half-time; subs reset per match).

### Knockout
- Bracket seeded randomly; byes when N isn't a power of two, using the tournament bye rule (fewest byes so far, then random — `16-tournaments.md`); with one room that's simply "random".
- Each tie is one match; level → extra time → penalties. Losers watch the rest (spectator view of live matches).

## 2. Solo run vs bots
- Draft (Balanced luck, or the player's choice), then up to **4 knockout matches** against bot XIs of rising strength. **One loss ends the run.** Level after extra time → penalties.
- Bot XIs are drafted by the same algorithm with the auto-picker, regenerated until their team rating falls in the round's band (Proposal):

  | Round | Bot team rating |
  |---|---|
  | 1 · Round of 16 | 78 ± 1 |
  | 2 · Quarter-final | 81 ± 1 |
  | 3 · Semi-final | 84 ± 1 |
  | 4 · Final | 87 ± 1 |
  Bot tactics: a preset per opponent (e.g. "Counter + Deep block", "High press + Short passing") shown in the pre-match card.
- Playback can be **skipped** (no one else to wait for) — the solo run is fast.
- **Record only:** "Best run 4/4", "Runs: 23", "Wins: 61" on the profile (`07-database.md`: `football_solo_run`). No coins, no unlocks, no rewards.
- Bot XI names: "Lagos Select", "Garki United", "Old GRA Stars"… (fictional, not real clubs).

## 3. Inside tournaments
A football stage is a stage like any other (`16-tournaments.md`): tables of 2 (knockout ties) or 3–8 (mini leagues), top K advance.

**Decided with Best (Oct 2026):** each player **drafts once**, at the first football stage, and **keeps that team** for every later football stage. Between stages they may change lineup, roles and tactics, but not the squad. Reasons: drafting takes 2–3 minutes per stage otherwise, and keeping your team gives the tournament a story. If a stage of a different game sits between football stages, the team waits safely (stored in the tournament, `16-tournaments.md`).

## Rules (RuleConfig) and Naija Standard preset

```ts
export type FootballRules = {
  turnSeconds: number;                 // RuleConfigBase: per draft pick (10–60)
  mode: "h2h_single" | "h2h_bo3" | "league" | "knockout" | "solo";
  draftLuck: "balanced" | "wild" | "elite";
  chemistry: boolean;                  // Proposal: on
  formationsOffered: 3 | 5;            // options in the formation pick
  subs: 5 | 7;                         // bench size drafted
  arrangeSeconds: number;              // after the draft, before kickoff (30–180)
  halfTimeSeconds: number;             // 20–90
  playbackSecondsPerHalf: number;      // 20–90
  subsPerMatch: 3 | 5;
  betweenMatchesSeconds: number;       // league/knockout/solo (15–90)
};

export const footballNaija: FootballRules = {
  turnSeconds: 20,
  mode: "h2h_single",                  // the room picks league/knockout automatically for 3+ managers (host can change)
  draftLuck: "balanced",
  chemistry: true,
  formationsOffered: 5,
  subs: 7,
  arrangeSeconds: 90,
  halfTimeSeconds: 40,
  playbackSecondsPerHalf: 40,
  subsPerMatch: 5,
  betweenMatchesSeconds: 30,
};
```

## Bot managers (Easy / Medium / Hard)
Bots draft and manage; the match itself is always the simulation (no "bot skill" during a half).

| Level | Draft | Lineup and tactics | Half-time |
|---|---|---|---|
| Easy | Picks randomly among the top 3 options by OVR | Formation's default roles; Balanced tactics | No changes |
| Medium | Best-fit auto-pick (`draft.md`) | Best roles by familiarity; tactics preset matched to its squad (pace → Counter, passers → Short passing) | Rule set from `tactics.md` |
| Hard | Best fit **+ chemistry**: scores each option by fit + chemistry links gained over the remaining picks (greedy look-ahead of 1 pick) | As Medium, plus counter-tactics vs the opponent's revealed team (e.g. high line vs slow defenders → Long ball + Advanced forward) | Rule set + reacts to the score and opponent's tactics |

All bot decisions are arithmetic over ≤ 5 options or ≤ 11 slots: well under 1 ms (CPU budget).

## Room events (animation/sound only)
`pick_made{seat}` (no player ids — hidden), `draft_done{seat}`, `teams_revealed{matchId}`, `half_started{matchId, half}`, `half_time{matchId}`, `full_time{matchId, score}`, `round_done{round}`, `run_over{wins}` (solo). Match events themselves are in the half's event list (`match-engine.md`).

## UI notes
Draft screen: a scroll-snap row of 5 option cards with the pitch above showing filled slots and team rating/chemistry; a 20 s ring. Arrange screen: drag players on the pitch, bench below, tactics sheet. Match: scoreboard bar, ticker, commentary feed. League: table + round fixtures. Design rules in `11-design-system.md`; **design questions with mockups go to Best before the UI is built.**

## Invariants (football room)
- A team never contains the same player twice; XI has exactly one keeper slot filled by the formation's GK slot (a keeper there, or a penalised outfielder).
- Option sets: 5 distinct players, none already in the manager's team, legend cap respected (`draft.md`).
- League table totals: Σ wins = Σ losses; Σ draws even; points = 3W + D; goals for = goals against overall.
- Every scheduled match is played exactly once; knockout produces one winner per tie.

## Phases of a football room

```ts
type FootballPhase = "lobby" | "draft" | "arrange" | "kickoff" | "first_half" | "half_time" | "second_half"
                   | "et_break" | "extra_time" | "penalties" | "between_matches" | "over";
```

```ts
type FootballState = {
  mode: "h2h_single" | "h2h_bo3" | "league" | "knockout" | "solo";
  phase: FootballPhase;
  dataVersion: string;
  seats: Record<SeatIndex, DraftSeat & { team: TeamSheet | null; ready: boolean }>;  // DraftSeat: draft.md
  schedule: Array<Array<{ id: string; a: SeatIndex | "bot"; b: SeatIndex | "bot" | "bye" }>>; // rounds
  round: number;
  matches: Record<string, {
    halves: Array<{ startedAt: number; events: CompactEvent[] }>;  // server time
    score: [number, number]; stats: MatchStats; winner: SeatIndex | null | "draw";
  }>;
  table: Array<{ seat: SeatIndex; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }>;
  windowEndsAt: number | null;                                     // pick / arrange / half-time / between-matches deadline
  places: SeatIndex[][] | null;
};

type FootballAction =
  | DraftAction                                                     // draft.md
  | { type: "half_time"; subs: Array<{ off: PlayerId; on: PlayerId }>; formation?: FormationId;
      roles?: Record<SlotIndex, RoleChoice>; tactics?: TeamTactics; ready: boolean }
  | { type: "skip_playback" };                                      // solo only
```

**View rules (hidden information):** before kickoff, a viewer sees only their own `DraftSeat`/team; others are `{ pick, ready }`. From kickoff of a match, both teams of that match are public. Spectators never see option sets or unrevealed teams.

**Timeout actions:** draft pick → auto-pick; arrange/half-time/between matches → keep current team (`ready`); after 3 consecutive timeouts the manager becomes `left` and a bot manages (auto-pick and the half-time rule set from `tactics.md`) — standard seat flow.

## Reconnection
- **During the draft:** the pick clock never pauses. Missed picks are auto-picked; on return the manager sees their team so far and continues with the current pick.
- **During a match:** the snapshot carries the current half's events and `startedAt`; the client jumps to "now" and keeps playing back. Missed half-time → no changes made.
- **Between league rounds:** missing the window just keeps the team.
- A bot never "plays" a match differently from a human: matches are simulations; a bot only covers draft picks and team management.

## Free-tier cost (rows written, Proposal estimates)
| Session | Draft | Matches | Total |
|---|---|---|---|
| 1v1 single match | ≈ 12–15 | ≈ 6–8 (kickoff, half-time, full time + alarms) | **≈ 20–25** |
| 1v1 best of 3 | ≈ 12–15 | ≈ 20 | **≈ 35** |
| 8-manager league (28 matches in 7 parallel rounds) | ≈ 50–60 | ≈ 7 rounds × ~6 | **≈ 100–110** |
| 8-manager knockout (3 rounds) | ≈ 50–60 | ≈ 3 × ~6 | **≈ 70–80** |
| Solo run (up to 4 matches) | ≈ 6 | ≈ 4 × ~5 | **≈ 25–30** |

Matches of a round share each write (one row holds the whole room), which is why a league costs little more than a knockout. Requests are dominated by alarms (pick deadlines with lazy re-arming, half starts, windows) ≈ the same order as rows.

## As built (engine, Oct 2026)

`createFootballGame(dataset)` in `packages/engine/src/games/football/game.ts` (browser entry `@gamehub/engine/football`: types, pitch, ratings, commentary, shouts; no zod, no data).

- **Phases:** `draft` (each manager picks at their own pace; finished managers arrange until Ready or their 90 s run out) → `live` (matches play in 3-minute chunks: the room's auto-advance sends a `tick` every 3 match minutes, ≈ 2.7 s; a tick plays up to the playback clock + 3 minutes, so a late tick catches up) → `break` (half-time, extra-time break; window = 3 minutes of playback + `halfTimeSeconds`) → `between` (after a round) → `over`. A round ends only once the screens have shown its last minute (`roundEndsAt`: the end of the half's playback plus the slack below, or the last shoot-out kick), so the results never arrive before the final goals do. Playback gives a minute with an attack in it up to twice the time so the build-up can be read, staying within 1.5 minutes of the real clock (`PLAYBACK_SLACK_MINUTES`); quiet minutes after it run shorter until it has caught up. **Match length** (decided with Best, Oct 2026): 60 s per half by default; presets Quick 40 s, Standard 60 s, Long 2 min, Full 4 min, or Custom from 20 s to 10 min per half. **Highlights** (room rule, on by default): quiet minutes run at 45 % speed, banking up to 1.5 minutes ahead of the real clock (the server always has the next 3), and a minute with an attack spends it, up to 3× as long; the total length stays about the same. **Tactical timeouts** (decided with Best, Oct 2026): each manager may call 2 a match (`timeout`); the match freezes for both sides for 20 s or until the caller taps Resume (`resume`), and changes made during it don't wait out the 2 s gap. A solo run has Pause instead, as often as you like (capped at 10 minutes). The fixture keeps `pause`; when it ends the server moves `startedAt` on by the time paused, and phones freeze their match clock the same way (`matchNow`), so playback carries on from where it stopped. **Ratings and the match report** (decided with Best, Oct 2026; `report.ts`): every player starts at 6.4 (a sub 6.2); a goal +1, an assist +0.6, a chance made +0.1, a shot on target +0.15, a save +0.35, a miss −0.05, offside −0.1, a booking −0.3, a sending-off −1.2; at full time the result ±0.2, the keeper −0.25 a goal conceded or +0.6 for a clean sheet, defenders +0.3 for one; 3–10. Live ratings show in Manage (the server sends earlier halves' changes as `ratingBase`, the phone adds what it has shown). Once a match is over its full log comes to its two managers (the other side's stamina lines still left out), and the report shows on the results screen and, folded, while you set up the next match: up to four reasons from your side (chances and xG, finishing, a change that turned it or a red card, where your chances came from), the stats, momentum by five minutes with the goals, and every rating with the player of the match.
- **Single match and best of 3 are knockouts** (extra time, penalties): a 1v1 always has a winner. Best of 3 is first to two wins.
- **Live decisions:** `shout` (attack, hold, press, counter), `tactics`, `role`, `formation`, `swap` (pitch ↔ pitch moves players; bench ↔ pitch is a substitution) at any time in a match, one every 2 s per manager. Before kickoff and between matches the same actions edit the team sheet. Solo runs can `skip` the rest of a half.
- **Bots:** draft by the auto-pick (Easy: one of the top three by OVR); Ready at once; in matches they react through `botReply` after each tick: tired players off from 60', Attack when behind from 55', Hold when 2 up from 65'. Solo-run bot XIs use the same rules inside the tick.
- **Seeds:** `state.seed` (drawn at setup, never in a view) feeds `${seed}:draft:${seat}:${pick}`, `${seed}:match:${fixture}:h${half}:m${minute}`, `${seed}:solo:…`, `${seed}:bracket`.
- **Views:** your own draft (options as full cards) and team; others only `{ pick, total, ready }`; teams revealed at kickoff. Only one fixture is sent in full (yours, or the first still playing): its teams, live state and the current half's events plus earlier goals, subs and red cards; others are a score line. Engine events (broadcast to everyone) carry no player ids during the draft (`pick_made { seat }`).
- **Measured (8-manager league, 4 matches at once):** a tick p50 1.0 ms, p95 2.5 ms (max ≈ 9 ms, first-call warm-up); a pick p95 ≈ 1 ms. State ≈ 24 KB; the largest view ≈ 26 KB.
- **Tests:** `game.test.ts` (every mode, hidden information, live changes, lead limit, determinism) and the cross-game fuzz (`all-games.fuzz.test.ts`, football with 1–8 managers and best of 3).
