# Football Draft — the draft

Every manager builds a team **privately and at the same time** from their **own** option sets. No shared pool, no snake draft. The same real player can turn up in several managers' options, and several managers may pick him; within one team a player appears at most once.

Inspiration: FC 26's draft (formation 1 of 5, captain 1 of 5, 1 of 5 for each spot, four matches, one loss ends it — `docs/research/sources.md`). Our flow, names and maths are our own.

## Pick flow

| Step | Choose | Options | Timer |
|---|---|---|---|
| 1 | **Formation** | 5 random from the 18 in `tactics.md` (distinct) | 20 s |
| 2 | **Captain** | 5 high-tier players (any position the formation has) | 20 s |
| 3–12 | **Starting XI** — the 10 slots the captain didn't fill, in a fixed order (GK, defence right→left, midfield, attack) | 5 players for **that slot's position** | 20 s each |
| 13–19 | **Subs (7)** | 5 players each; positions **GK, DEF, DEF, MID, MID, ATT, ATT** (Proposal) | 20 s each |

19 picks in total ≈ 6–7 minutes at full timers; most people pick in 3–6 s, so a draft takes 2–3 minutes.

- The **captain** is placed in a matching slot (primary position first, then alternates); if two slots match (e.g. two CBs), the manager taps which.
- After the last pick: **rearrange** — drag players between slots and the bench (out-of-position penalties shown live), set roles and team tactics. Rearranging ends at **Ready** or when the room's kickoff timer (90 s, Proposal) runs out.
- The client shows **team rating** and **chemistry** live as picks come in (computed with the engine's shared code).

### Timers and auto-pick
- 20 s per pick (Proposal; rule option 10–60 s). The pick clock is per manager (like RPS's per-seat clocks) on server time.
- **Timeout → server auto-pick:** the option with the highest *fit score* = effective OVR in the slot (OVR − out-of-position penalty + familiarity bonus for the slot's default role) + 1 per chemistry link it would add; ties → higher OVR → lower list index. Formation timeout → the first offered formation that best fits the picks so far (none yet → first). Captain timeout → highest OVR.
- A disconnected manager keeps drafting by auto-pick (their seat isn't frozen); when they come back they continue from the current pick.

## Team rating (shown on the card and used by the solo run)
`teamRating = round(mean effective OVR of the XI + 0.1 × Σ max(0, ovr_i − mean))` — a mean with a small boost for stars, like a football game would show (exact FC formula unknown; this one is ours). Subs don't count.

## Probability — how an option set is built

### Tiers

| Tier | OVR | Base weight (Balanced) |
|---|---|---|
| T1 Elite | 86+ | 2 |
| T2 Star | 82–85 | 6 |
| T3 Strong | 77–81 | 12 |
| T4 Solid | 72–76 | 10 |
| T5 Squad | ≤ 71 | 4 |

Flags multiply the weight: **Legend × 0.35**, **Wonderkid × 1.3**.

Position fit multiplies too: primary position × 1.0, alternate × 0.5. Only players who can play the slot (primary or alternate) are candidates.

### Building one set of 5 (per slot)

```ts
function optionSet(rng: Rng, slot: Position, ctx: DraftCtx, luck: LuckPreset): Player[] {
  const pool = candidates(slot)                                   // primary or alternate at `slot`
    .filter((p) => !ctx.picked.has(p.id));                        // never offer someone already in your team
  const jackpot = rng.int(1000) < luck.jackpotPer1000;            // rare: allow a 2nd legend
  const out: Player[] = [];
  while (out.length < 5) {
    const legends = out.filter((p) => p.group === "legend").length;
    const allowed = pool.filter((p) => !out.includes(p) &&
      (p.group !== "legend" || legends < (jackpot ? 2 : 1)));
    out.push(weightedPick(rng, allowed, (p) => weight(p, slot, luck)));
  }
  // Guarantee: at least one option at or above the floor; replace the weakest if needed.
  if (!out.some((p) => p.ovr >= luck.floorOvr)) {
    const strong = pool.filter((p) => p.ovr >= luck.floorOvr && !out.includes(p));
    out[indexOfLowest(out)] = weightedPick(rng, strong, (p) => weight(p, slot, luck));
  }
  return rng.shuffle(out);                                        // order carries no information
}
```

- **No duplicates inside a set**, **no player already picked by this manager**.
- At most **1 Legend per set**, 2 on a **jackpot** roll.
- Every set has **≥ 1 option at the floor OVR** (`floorOvr` by preset).
- **Captain sets** draw only from T1 + T2 + Legends (Legend weight × 1.5 here), guarantee ≥ 2 options ≥ 86.
- **Sub sets** use the same weights but a floor 4 lower.
- If a slot's pool is too thin (e.g. few LWB cards), candidates widen to the slot's position group with the out-of-position penalty shown on the card.

### "Draft luck" presets (room rule)

| Preset | Tier weights T1/T2/T3/T4/T5 | Legend × | Wonderkid × | Floor OVR (XI) | Jackpot / 1000 | Feel |
|---|---|---|---|---|---|---|
| **Balanced** (default) | 2 / 6 / 12 / 10 / 4 | 0.35 | 1.3 | 80 | 20 | Most teams 80–84, a few stars |
| **Wild** | 3 / 5 / 8 / 10 / 8 | 0.6 | 1.6 | 76 | 60 | Big variance: dream teams and disasters |
| **Elite** | 6 / 10 / 6 / 1 / 0 | 0.5 | 1.0 | 84 | 30 | High-rated only |

### Seeded and hidden
- All sets come from the room's seeded RNG: stream `${rngSeed}:draft:${seat}:${pickIndex}` (a separate stream per manager and pick, so a manager's options don't depend on how fast others pick, and a re-generated set after an eviction is **identical**).
- **Hidden information** (`14-security.md`): a set is put into **that manager's view only, only while that pick is active**. Other managers and spectators see only "@ada is on pick 9/19". Nobody sees another manager's picks, formation or captain **until kickoff**, when both XIs and benches are revealed.
- The RNG seed never leaves the server; the property test "no view contains another seat's options or picks" runs on random drafts (`12-testing.md`).

## Simulation test and targets
CI job: draft **10,000 teams per preset** with the auto-picker (fit score above), on the current dataset (sample file in early tests, full set later). Report median, p10, p90, max of team rating and the share of teams with ≥ 1 Legend.

Targets (Proposal — community FC drafts typically land in the mid-80s on EA's scale where real top clubs are 80–84; ⚠️ that comparison is unverified, so our targets are set on **our** scale where the best current player is 91):

| Preset | p10 | Median | p90 | Max (seen) | Teams with ≥ 1 Legend |
|---|---|---|---|---|---|
| Balanced | ≥ 79 | 81–83 | ≤ 86 | ≤ 89 | 35–55 % |
| Wild | ≥ 75 | 79–82 | ≤ 88 | ≤ 91 | 50–75 % |
| Elite | ≥ 83 | 84–86 | ≤ 88 | ≤ 90 | 45–70 % |

Tuning loop: adjust tier weights → rerun → record the final weights and the observed numbers in this file ("Tuning log") before launch. The same test checks: no duplicates in any set, legend cap respected, floor guarantee, captain guarantee.

### Tuning log
_(empty until the full dataset exists; each entry: date, dataset version, weights, results.)_

## State and actions (draft part; full types in `modes.md`)

```ts
type DraftSeat = {
  pick: number;                                   // 0..19 (19 = done)
  formation: FormationId | null;
  captain: PlayerId | null;
  xi: Partial<Record<SlotIndex, PlayerId>>;
  subs: PlayerId[];
  offer: { kind: "formation"; ids: FormationId[] } | { kind: "player"; slot: Position | "SUB"; ids: PlayerId[] } | null; // HIDDEN from others
  deadline: number;                               // server time
};

type DraftAction =
  | { type: "pick_formation"; id: FormationId }
  | { type: "pick_player"; id: PlayerId; slot?: SlotIndex }   // slot only for the captain
  | { type: "arrange"; xi: Record<SlotIndex, PlayerId>; subs: PlayerId[]; roles: Record<SlotIndex, RoleChoice>; tactics: TeamTactics }
  | { type: "ready" };
```

View: your own `DraftSeat` in full; for others `{ pick, ready }` only.

## Free-tier cost per draft
- 19 picks per manager. To save writes, **picks are checkpointed**: the room persists on every 4th pick, on the last pick and on `ready`, and keeps the latest picks in the manager's **connection attachment** (no storage write; survives hibernation). If the object is evicted between checkpoints and the attachment is gone too (the manager also reconnected), the manager redoes ≤ 3 picks from **identical** option sets (seeded per pick). (Proposal.)
- Per manager ≈ 6 writes; 2 managers ≈ 12–15 rows; 8 managers ≈ 50–60 rows (+ lazy alarms for pick deadlines).
