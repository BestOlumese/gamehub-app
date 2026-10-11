// Positions, formations, roles and familiarity (docs/games/football-draft/tactics.md).
import type { FootballPlayer, Position, Role } from "./types";

export type Group = "GK" | "DEF" | "MID" | "ATT";

export const GROUP: Record<Position, Group> = {
  GK: "GK",
  RB: "DEF",
  CB: "DEF",
  LB: "DEF",
  RWB: "DEF",
  LWB: "DEF",
  DM: "MID",
  CM: "MID",
  AM: "MID",
  RM: "MID",
  LM: "MID",
  RW: "ATT",
  LW: "ATT",
  ST: "ATT",
};

/** How much a player loses in a position: primary 0, alternate −2, same group −6, else −15 (−40 in or out of goal). */
export function positionPenalty(p: Pick<FootballPlayer, "positions">, pos: Position): number {
  const i = p.positions.indexOf(pos);
  if (i === 0) return 0;
  if (i > 0) return 2;
  const keeper = p.positions[0] === "GK";
  if (keeper !== (pos === "GK")) return 40;
  return p.positions.some((x) => GROUP[x] === GROUP[pos]) ? 6 : 15;
}

/** Each position's share of the DEF, MID and ATT units (the keeper is its own unit). */
export const UNIT_WEIGHTS: Record<Position, [number, number, number]> = {
  GK: [0, 0, 0],
  CB: [0.85, 0.15, 0],
  RB: [0.65, 0.25, 0.1],
  LB: [0.65, 0.25, 0.1],
  RWB: [0.45, 0.3, 0.25],
  LWB: [0.45, 0.3, 0.25],
  DM: [0.45, 0.5, 0.05],
  CM: [0.2, 0.6, 0.2],
  AM: [0.05, 0.45, 0.5],
  RM: [0.15, 0.5, 0.35],
  LM: [0.15, 0.5, 0.35],
  RW: [0.05, 0.25, 0.7],
  LW: [0.05, 0.25, 0.7],
  ST: [0, 0.15, 0.85],
};

export type Slot = { pos: Position; x: number; y: number };
export type Formation = { id: number; name: string; slots: Slot[] };

const F = (id: number, name: string, spec: string): Formation => ({
  id,
  name,
  slots: spec.split(" ").map((t) => {
    const m = /^([A-Z]+)\((\d+),(\d+)\)$/.exec(t);
    if (!m) throw new Error(`bad slot ${t}`);
    return { pos: m[1] as Position, x: Number(m[2]), y: Number(m[3]) };
  }),
});

/** The 18 formations; slots GK first, then back to front, right to left. */
export const FORMATIONS: readonly Formation[] = [
  F(
    1,
    "4-3-3 Holding",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(50,38) CM(68,50) CM(32,50) RW(84,76) ST(50,86) LW(16,76)",
  ),
  F(
    2,
    "4-3-3 Attack",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) CM(68,46) CM(32,46) AM(50,62) RW(84,76) ST(50,86) LW(16,76)",
  ),
  F(
    3,
    "4-2-3-1",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(62,38) DM(38,38) RW(82,64) AM(50,62) LW(18,64) ST(50,86)",
  ),
  F(
    4,
    "4-4-2",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) RM(85,52) CM(62,48) CM(38,48) LM(15,52) ST(62,84) ST(38,84)",
  ),
  F(
    5,
    "4-4-2 Holding",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) RM(85,52) DM(62,40) DM(38,40) LM(15,52) ST(62,84) ST(38,84)",
  ),
  F(
    6,
    "4-1-2-1-2 Narrow",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(50,36) CM(68,50) CM(32,50) AM(50,64) ST(62,85) ST(38,85)",
  ),
  F(
    7,
    "4-4-1-1",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) RM(85,52) CM(62,48) CM(38,48) LM(15,52) AM(50,68) ST(50,86)",
  ),
  F(
    8,
    "4-1-4-1",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(50,36) RM(85,56) CM(62,52) CM(38,52) LM(15,56) ST(50,86)",
  ),
  F(
    9,
    "4-3-1-2",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) CM(72,46) CM(50,44) CM(28,46) AM(50,64) ST(62,85) ST(38,85)",
  ),
  F(
    10,
    "4-2-2-2",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) DM(62,38) DM(38,38) AM(72,64) AM(28,64) ST(62,85) ST(38,85)",
  ),
  F(
    11,
    "4-3-2-1",
    "GK(50,5) RB(85,24) CB(62,20) CB(38,20) LB(15,24) CM(72,46) CM(50,44) CM(28,46) AM(64,66) AM(36,66) ST(50,86)",
  ),
  F(
    12,
    "3-5-2",
    "GK(50,5) CB(72,20) CB(50,18) CB(28,20) RWB(90,44) DM(62,38) DM(38,38) LWB(10,44) AM(50,62) ST(62,85) ST(38,85)",
  ),
  F(
    13,
    "3-4-3",
    "GK(50,5) CB(72,20) CB(50,18) CB(28,20) RWB(90,46) CM(62,46) CM(38,46) LWB(10,46) RW(80,76) ST(50,86) LW(20,76)",
  ),
  F(
    14,
    "3-4-2-1",
    "GK(50,5) CB(72,20) CB(50,18) CB(28,20) RWB(90,46) CM(62,46) CM(38,46) LWB(10,46) AM(66,66) AM(34,66) ST(50,86)",
  ),
  F(
    15,
    "3-1-4-2",
    "GK(50,5) CB(72,20) CB(50,18) CB(28,20) DM(50,34) RM(88,52) CM(62,50) CM(38,50) LM(12,52) ST(62,84) ST(38,84)",
  ),
  F(
    16,
    "5-3-2",
    "GK(50,5) RWB(90,30) CB(70,20) CB(50,18) CB(30,20) LWB(10,30) CM(68,48) DM(50,40) CM(32,48) ST(62,82) ST(38,82)",
  ),
  F(
    17,
    "5-2-3",
    "GK(50,5) RWB(90,32) CB(70,20) CB(50,18) CB(30,20) LWB(10,32) CM(62,46) CM(38,46) RW(80,74) ST(50,84) LW(20,74)",
  ),
  F(
    18,
    "5-4-1",
    "GK(50,5) RWB(90,30) CB(70,20) CB(50,18) CB(30,20) LWB(10,30) RM(84,54) CM(62,48) CM(38,48) LM(16,54) ST(50,84)",
  ),
];

export const formation = (id: number): Formation => {
  const f = FORMATIONS.find((x) => x.id === id);
  if (!f) throw new Error(`no formation ${id}`);
  return f;
};

/** Roles for each position, the first being the default. */
export const POSITION_ROLES: Record<Position, readonly Role[]> = {
  GK: ["shot_stopper", "sweeper_keeper", "ball_playing_keeper"],
  CB: ["stopper", "ball_playing_defender", "covering_defender"],
  RB: ["full_back", "attacking_full_back", "inverted_full_back"],
  LB: ["full_back", "attacking_full_back", "inverted_full_back"],
  RWB: ["wing_back", "complete_wing_back"],
  LWB: ["wing_back", "complete_wing_back"],
  DM: ["anchor", "deep_playmaker", "ball_winner"],
  CM: ["box_to_box", "playmaker", "roaming_midfielder", "ball_winner"],
  AM: ["classic_ten", "shadow_striker", "advanced_playmaker"],
  RM: ["wide_midfielder", "wide_playmaker", "defensive_winger"],
  LM: ["wide_midfielder", "wide_playmaker", "defensive_winger"],
  RW: ["winger", "inside_forward", "wide_playmaker"],
  LW: ["winger", "inside_forward", "wide_playmaker"],
  ST: ["advanced_forward", "poacher", "target_forward", "false_nine", "pressing_forward"],
};

/** Each role's focus options, the first being the default. */
export const ROLE_FOCUS: Record<Role, readonly string[]> = {
  shot_stopper: ["stay_home"],
  sweeper_keeper: ["balanced", "aggressive"],
  ball_playing_keeper: ["short", "long"],
  stopper: ["step_up", "hold"],
  ball_playing_defender: ["short", "long"],
  covering_defender: ["balanced"],
  full_back: ["balanced", "stay_back"],
  attacking_full_back: ["overlap", "cross"],
  inverted_full_back: ["step_in"],
  wing_back: ["balanced", "attack"],
  complete_wing_back: ["attack", "dribble"],
  anchor: ["screen", "hold_line"],
  deep_playmaker: ["short", "switch"],
  ball_winner: ["press", "cover"],
  box_to_box: ["balanced", "late_runs"],
  playmaker: ["keep_ball", "through_balls"],
  roaming_midfielder: ["half_spaces", "shoot"],
  classic_ten: ["create", "shoot"],
  shadow_striker: ["arrive"],
  advanced_playmaker: ["through_balls", "wide"],
  wide_midfielder: ["balanced", "track_back"],
  wide_playmaker: ["cut_inside", "cross"],
  defensive_winger: ["track_back"],
  winger: ["cross", "dribble"],
  inside_forward: ["shoot", "create"],
  poacher: ["stay_central"],
  target_forward: ["hold_up", "aerial"],
  false_nine: ["drop_deep"],
  advanced_forward: ["run_in_behind", "link_play"],
  pressing_forward: ["press_high"],
};

/** Familiarity bonus for a role: ++ +4, + +2, otherwise 0. */
export function familiarity(p: Pick<FootballPlayer, "roles">, role: Role): number {
  const f = p.roles[role];
  return f === "plusplus" ? 4 : f === "plus" ? 2 : 0;
}

/** The role a player knows best at a position (the default role on a tie). */
export function bestRole(p: Pick<FootballPlayer, "roles">, pos: Position): Role {
  const roles = POSITION_ROLES[pos];
  let best = roles[0] as Role;
  for (const r of roles) if (familiarity(p, r) > familiarity(p, best)) best = r;
  return best;
}
