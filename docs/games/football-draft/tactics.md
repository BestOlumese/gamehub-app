# Football Draft — formations, tactics, roles, chemistry

Our own system. EA FC 27's tactics and its 37 roles with Role+/Role++ familiarity were looked at **for inspiration only** (`docs/research/sources.md`). Names below are generic football vocabulary (poacher, false nine, box-to-box, inverted full-back…), not EA terms. Effects are defined precisely so the match engine (`match-engine.md`) can implement and test them.

## Positions (14)

| Code | Position | Group |
|---|---|---|
| GK | Goalkeeper | GK |
| RB / LB | Right / left full-back | DEF |
| CB | Centre-back | DEF |
| RWB / LWB | Right / left wing-back | DEF (wide) |
| DM | Defensive midfielder | MID |
| CM | Central midfielder | MID |
| AM | Attacking midfielder | MID (att) |
| RM / LM | Right / left midfielder | MID (wide) |
| RW / LW | Right / left winger | ATT |
| ST | Striker | ATT |

A player card has a primary position and up to two alternates (`player-database.md`).

**Out-of-position penalty** (effective OVR for the match engine and team rating):

| Placed in | Penalty |
|---|---|
| Primary position | 0 |
| An alternate position | −2 |
| Same group, not listed (e.g. CM placed at DM) | −6 |
| Different group (e.g. ST placed at CB) | −15 |
| Outfield player in goal / keeper outfield | −40 |

## Formations (18)

Pitch coordinates: `x` 0 (left touchline) → 100 (right), `y` 0 (own goal line) → 100 (opponent's). Slots are listed GK first, then back to front, right to left.

| # | Formation | Slots `pos(x,y)` |
|---|---|---|
| 1 | 4-3-3 Holding | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(50,38) CM(68,50) CM(32,50) RW(84,76) ST(50,86) LW(16,76) |
| 2 | 4-3-3 Attack | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) CM(68,46) CM(32,46) AM(50,62) RW(84,76) ST(50,86) LW(16,76) |
| 3 | 4-2-3-1 | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(62,38) DM(38,38) RW(82,64) AM(50,62) LW(18,64) ST(50,86) |
| 4 | 4-4-2 | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) RM(85,52) CM(62,48) CM(38,48) LM(15,52) ST(62,84) ST(38,84) |
| 5 | 4-4-2 Holding | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) RM(85,52) DM(62,40) DM(38,40) LM(15,52) ST(62,84) ST(38,84) |
| 6 | 4-1-2-1-2 Narrow | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(50,36) CM(68,50) CM(32,50) AM(50,64) ST(62,85) ST(38,85) |
| 7 | 4-4-1-1 | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) RM(85,52) CM(62,48) CM(38,48) LM(15,52) AM(50,68) ST(50,86) |
| 8 | 4-1-4-1 | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(50,36) RM(85,56) CM(62,52) CM(38,52) LM(15,56) ST(50,86) |
| 9 | 4-3-1-2 | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) CM(72,46) CM(50,44) CM(28,46) AM(50,64) ST(62,85) ST(38,85) |
| 10 | 4-2-2-2 | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(62,38) DM(38,38) AM(72,64) AM(28,64) ST(62,85) ST(38,85) |
| 11 | 4-3-2-1 | GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) CM(72,46) CM(50,44) CM(28,46) AM(64,66) AM(36,66) ST(50,86) |
| 12 | 3-5-2 | GK(50,5) CB(72,20) CB(50,18) CB(28,20) RWB(90,44) DM(62,38) DM(38,38) LWB(10,44) AM(50,62) ST(62,85) ST(38,85) |
| 13 | 3-4-3 | GK(50,5) CB(72,20) CB(50,18) CB(28,20) RWB(90,46) CM(62,46) CM(38,46) LWB(10,46) RW(80,76) ST(50,86) LW(20,76) |
| 14 | 3-4-2-1 | GK(50,5) CB(72,20) CB(50,18) CB(28,20) RWB(90,46) CM(62,46) CM(38,46) LWB(10,46) AM(66,66) AM(34,66) ST(50,86) |
| 15 | 3-1-4-2 | GK(50,5) CB(72,20) CB(50,18) CB(28,20) DM(50,34) RM(88,52) CM(62,50) CM(38,50) LM(12,52) ST(62,84) ST(38,84) |
| 16 | 5-3-2 | GK(50,5) RWB(90,30) CB(70,20) CB(50,18) CB(30,20) LWB(10,30) CM(68,48) DM(50,40) CM(32,48) ST(62,82) ST(38,82) |
| 17 | 5-2-3 | GK(50,5) RWB(90,32) CB(70,20) CB(50,18) CB(30,20) LWB(10,32) CM(62,46) CM(38,46) RW(80,74) ST(50,84) LW(20,74) |
| 18 | 5-4-1 | GK(50,5) RWB(90,30) CB(70,20) CB(50,18) CB(30,20) LWB(10,30) RM(84,54) CM(62,48) CM(38,48) LM(16,54) ST(50,84) |

Every formation has exactly 1 GK and 11 slots. The draft offers 5 of these 18 at random (`draft.md`).

## Unit strengths (how players feed the match engine)

Each slot contributes to four units with weights by position (sum of a slot's weights = 1):

| Position | DEF | MID | ATT | Notes |
|---|---|---|---|---|
| GK | — | — | — | Separate **GK unit** = keeper's effective OVR |
| CB | 0.85 | 0.15 | 0 | |
| RB/LB | 0.65 | 0.25 | 0.10 | |
| RWB/LWB | 0.45 | 0.30 | 0.25 | |
| DM | 0.45 | 0.50 | 0.05 | |
| CM | 0.20 | 0.60 | 0.20 | |
| AM | 0.05 | 0.45 | 0.50 | |
| RM/LM | 0.15 | 0.50 | 0.35 | |
| RW/LW | 0.05 | 0.25 | 0.70 | |
| ST | 0 | 0.15 | 0.85 | |

A slot's **effective OVR** = card OVR − out-of-position penalty + familiarity bonus + chemistry modifier + fatigue modifier (all below). Unit strength = weighted mean of effective OVR (and of the relevant face stats for event resolution: DEF uses DEF/POW/SPD, MID uses PAS/SKL, ATT uses FIN/SPD/SKL/POW).

## Team tactics

Set before kickoff and at half-time. Every effect is a **multiplier or additive term on match-engine parameters**; numbers are the starting calibration and are covered by the Monte Carlo tests.

| Setting | Options | Effect in the engine |
|---|---|---|
| **Build-up style** | Balanced · Short passing · Long ball · Counter | Short: possession weight ×1.06, chance quality ×0.97 (patient, fewer direct chances), benefits PAS/SKL. Long ball: possession ×0.94, 20 % of attacks become **direct** (skip the midfield duel; ATT vs DEF only; favours POW/SPD strikers). Counter: possession ×0.90; attacks that start from a won ball (transition) get chance quality ×1.25, and ×1.4 when the opponent's line height ≥ 65. |
| **Defensive approach** | Balanced · High press · Mid block · Deep block | High press: possession ×1.08, opponent attack rate ×0.92, but opponent **transition** chances ×1.15; fatigue +20 %. Mid block: neutral. Deep block: own possession ×0.90, opponent shots ×1.10 but opponent chance quality ×0.85; own transitions ×1.10. |
| **Line height** | 0–100 (default 50) | Each point above 50: opponent through-ball chance quality +0.25 % × (their attackers' SPD − our defenders' SPD)/10, offside calls on opponents +0.6 %. Below 50: the reverse, and own press weaker (possession −0.1 %/point). |
| **Width** | 0–100 (default 50) | Wide (> 50): share of attacks from crosses = 30 % + (w−50) × 0.6 %; crosses resolve with POW (headers) vs DEF/POW; corners +0.4 %/point. Narrow: central combinations resolve with SKL/PAS vs DEF; more blocked shots. |
| **Tempo** | 0–100 (default 50) | Attacks per minute ×(1 + (t−50) × 0.004); chance quality ×(1 − (t−50) × 0.002); fatigue +(t−50) × 0.3 %. |
| **Players in box** | 1–5 (default 3) | Chance conversion ×(1 + (n−3) × 0.04); opponent transition chance quality ×(1 + (n−3) × 0.06). |

## Player roles (ours)

Each slot gets a role (from its position's list) and a **focus** (1–3 options per role). Role + focus shift which face stats count most for that slot and which events the player is picked for (shooter, crosser, tackler…).

| Position | Role (id) | Focus options | What it does |
|---|---|---|---|
| GK | Shot stopper (`shot_stopper`) | Stay home | +STP/RCT weight; fewer sweeps |
| GK | Sweeper keeper (`sweeper_keeper`) | Balanced · Aggressive | Cuts out through-balls (reduces opponent through-ball quality by 8 %/12 %), small risk of being lobbed |
| GK | Ball-playing keeper (`ball_playing_keeper`) | Short · Long | Adds DST to the team's build-up (short) or direct attacks (long) |
| CB | Stopper (`stopper`) | Step up · Hold | Wins duels high (DEF/POW), more fouls |
| CB | Ball-playing defender (`ball_playing_defender`) | Short · Long passes | Adds PAS to MID unit (0.1 of its weight) |
| CB | Covering defender (`covering_defender`) | Balanced | SPD weighted higher vs through-balls |
| RB/LB | Full-back (`full_back`) | Stay back · Balanced | Defensive weight +0.1 |
| RB/LB | Attacking full-back (`attacking_full_back`) | Overlap · Cross | Moves 0.1 of weight DEF → ATT; delivers crosses |
| RB/LB | Inverted full-back (`inverted_full_back`) | Step into midfield | Moves 0.15 DEF → MID |
| RWB/LWB | Wing-back (`wing_back`) | Balanced · Attack | Width source; crosses |
| RWB/LWB | Complete wing-back (`complete_wing_back`) | Attack · Dribble | ATT weight +0.15; fatigue +10 % |
| DM | Anchor (`anchor`) | Screen · Hold line | DEF weight +0.1; reduces opponent central chances |
| DM | Deep playmaker (`deep_playmaker`) | Short · Switch play | PAS feeds possession and build-up |
| DM / CM | Ball winner (`ball_winner`) | Press · Cover | Wins ball (DEF/POW), more fouls and cards |
| CM | Box-to-box (`box_to_box`) | Balanced · Late runs | Splits MID/ATT; late-run shots |
| CM | Playmaker (`playmaker`) | Keep ball · Through balls | PAS/SKL weight; creates chances for others |
| CM | Roaming midfielder (`roaming_midfielder`) | Half-spaces · Shoot | Moves 0.1 MID → ATT |
| AM | Classic ten (`classic_ten`) | Create · Shoot | Key-pass source |
| AM | Shadow striker (`shadow_striker`) | Arrive in box | Chosen as shooter more often |
| AM | Advanced playmaker (`advanced_playmaker`) | Through balls · Wide | Through-ball chance quality +5 % |
| RM/LM | Wide midfielder (`wide_midfielder`) | Balanced · Track back | MID/DEF balance |
| RM/LM/RW/LW | Wide playmaker (`wide_playmaker`) | Cut inside · Cross | Creates from wide |
| RM/LM | Defensive winger (`defensive_winger`) | Track back | DEF weight +0.1 |
| RW/LW | Winger (`winger`) | Cross · Dribble | Width; crosses (cross) or take-ons (SKL/SPD) |
| RW/LW | Inside forward (`inside_forward`) | Shoot · Create | Shoots from the half-space (FIN) or creates (PAS) |
| ST | Poacher (`poacher`) | Stay central | Highest share of box shots; FIN weight up |
| ST | Target forward (`target_forward`) | Hold up · Aerial | POW; good with long ball and crosses |
| ST | False nine (`false_nine`) | Drop deep | Moves 0.2 ATT → MID; creates for wingers |
| ST | Advanced forward (`advanced_forward`) | Run in behind · Link play | SPD vs line height |
| ST | Pressing forward (`pressing_forward`) | Press high | Adds to the team press; fatigue +10 % |

### Familiarity
Each player card lists the roles they know, with a level (`player-database.md`):

| Level | Effect on that slot's effective OVR | Shown as |
|---|---|---|
| **++** | +4 | two filled pips |
| **+** | +2 | one filled pip |
| **base** (role belongs to their position but isn't listed) | 0 | — |
| **out of position** (role of a position they can't play) | position penalty above | red badge |

## Chemistry (Proposal — Best to confirm; default on; room rule "Chemistry: on/off")

Simple, transparent links. No adjacency diagrams.

**Per-player points (0–3)** — count the **starting XI** only:

| Link | +1 | +2 | +3 |
|---|---|---|---|
| Same **nation** (count includes the player) | 2 players | 5 players | 8 players |
| Same **club** (current club text) | 2 players | 4 players | 7 players |
| Same **league** (only once we store leagues) | 3 players | 5 players | 8 players |

A player's chemistry = min(3, nation pts + club pts + league pts). **Out-of-position players have 0.** **Legends** have no club or league; they link **by nation only**, and each Legend counts **twice** toward its nation's count (so a Nigerian Legend helps Nigerian teammates). Team chemistry = sum (0–33), shown as "Chemistry 27/33".

**Effect in the match engine** (added to effective OVR): 0 → −2 · 1 → 0 · 2 → +1 · 3 → +2.

With chemistry **off**, everyone counts as 1 (no effect), and the UI hides chemistry.

## Half-time

- **Window: 40 s** (Proposal) after the first half's playback ends. Both managers act at the same time; the countdown is server time.
- Allowed: up to **5 substitutions in total for the match** (half-time and, in knockouts, before extra time; +1 extra in extra time), any formation change (players keep their roles where the position exists; otherwise default role), all team tactics.
- **No live changes during play** — the simulation of each half is fixed once it starts.
- Timeout → no changes (keep the team). A disconnected manager gets the same default.
- Bots: a simple rule set (bring on a fresher sub with higher effective OVR at a slot below 70 % fitness; switch to Counter + Deep block when leading by 2; to High press + Players in box 4 when trailing).

## Fatigue (simple)
Fitness starts at 100 for each match, drops per minute by `0.55 × (1 + press/role/tempo modifiers)`, floor 60. Effective OVR modifier: −1 per 8 points below 92. Subs come on fresh. No injuries in v1 (Proposal; see `match-engine.md`).
