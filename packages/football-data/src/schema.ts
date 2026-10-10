import { z } from "zod";

// Football Draft player records (docs/games/football-draft/player-database.md). Names and public
// facts only; every rating is ours.

export const POSITIONS = [
  "GK",
  "RB",
  "CB",
  "LB",
  "RWB",
  "LWB",
  "DM",
  "CM",
  "AM",
  "RM",
  "LM",
  "RW",
  "LW",
  "ST",
] as const;
export type Position = (typeof POSITIONS)[number];

/** Must match docs/games/football-draft/tactics.md → "Player roles". */
export const ROLES = [
  "shot_stopper",
  "sweeper_keeper",
  "ball_playing_keeper",
  "stopper",
  "ball_playing_defender",
  "covering_defender",
  "full_back",
  "attacking_full_back",
  "inverted_full_back",
  "wing_back",
  "complete_wing_back",
  "anchor",
  "deep_playmaker",
  "ball_winner",
  "box_to_box",
  "playmaker",
  "roaming_midfielder",
  "classic_ten",
  "shadow_striker",
  "advanced_playmaker",
  "wide_midfielder",
  "wide_playmaker",
  "defensive_winger",
  "winger",
  "inside_forward",
  "poacher",
  "target_forward",
  "false_nine",
  "advanced_forward",
  "pressing_forward",
] as const;
export type Role = (typeof ROLES)[number];

/** The positions each role is played from (tactics.md). */
export const ROLE_POSITIONS: Record<Role, readonly Position[]> = {
  shot_stopper: ["GK"],
  sweeper_keeper: ["GK"],
  ball_playing_keeper: ["GK"],
  stopper: ["CB"],
  ball_playing_defender: ["CB"],
  covering_defender: ["CB"],
  full_back: ["RB", "LB"],
  attacking_full_back: ["RB", "LB"],
  inverted_full_back: ["RB", "LB"],
  wing_back: ["RWB", "LWB"],
  complete_wing_back: ["RWB", "LWB"],
  anchor: ["DM"],
  deep_playmaker: ["DM"],
  ball_winner: ["DM", "CM"],
  box_to_box: ["CM"],
  playmaker: ["CM"],
  roaming_midfielder: ["CM"],
  classic_ten: ["AM"],
  shadow_striker: ["AM"],
  advanced_playmaker: ["AM"],
  wide_midfielder: ["RM", "LM"],
  wide_playmaker: ["RM", "LM", "RW", "LW"],
  defensive_winger: ["RM", "LM"],
  winger: ["RW", "LW"],
  inside_forward: ["RW", "LW"],
  poacher: ["ST"],
  target_forward: ["ST"],
  false_nine: ["ST"],
  advanced_forward: ["ST"],
  pressing_forward: ["ST"],
};

/** Position groups (tactics.md): roles may come from a player's group or a neighbouring one. */
export const POSITION_GROUP: Record<Position, "GK" | "DEF" | "MID" | "ATT"> = {
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

const stat = z.number().int().min(1).max(99);

export const outfieldStats = z.strictObject({
  spd: stat, // Speed
  fin: stat, // Finishing
  pas: stat, // Passing
  skl: stat, // Skill (ball control, dribbling)
  def: stat, // Defending
  pow: stat, // Power (strength, aerials, stamina)
});
export const keeperStats = z.strictObject({
  stp: stat, // Shot-stopping
  rct: stat, // Reactions
  hdl: stat, // Handling
  cmd: stat, // Command of the area
  dst: stat, // Distribution
  agi: stat, // Agility
});
export type OutfieldStats = z.infer<typeof outfieldStats>;
export type KeeperStats = z.infer<typeof keeperStats>;

export const playerSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/), // stable slug, never reused: "victor-osimhen"
  name: z.string().min(2).max(60),
  short: z.string().min(2).max(16),
  group: z.enum(["current", "legend", "wonderkid"]),
  positions: z.array(z.enum(POSITIONS)).min(1).max(3), // [primary, ...up to 2 alternates]
  ovr: z.number().int().min(40).max(96),
  stats: z.union([outfieldStats, keeperStats]),
  nation: z.string().regex(/^[A-Z]{2}(-[A-Z]{3})?$/), // ISO 3166-1 alpha-2; "GB-ENG" etc.
  club: z.string().min(2).max(40).nullable(),
  clubAsOf: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(),
  league: z.string().min(2).max(40).nullable().optional(),
  era: z
    .string()
    .regex(/^Prime \d{4}–\d{4}$/)
    .nullable(),
  potential: z.enum(["high", "elite"]).nullable(),
  foot: z.enum(["R", "L", "B"]),
  birthYear: z.number().int().min(1900).max(2012).optional(),
  heightCm: z.number().int().min(150).max(210).optional(),
  roles: z.partialRecord(z.enum(ROLES), z.enum(["plus", "plusplus"])),
  basis: z.string().min(20).max(280),
  sources: z.array(z.url()).max(5).optional(),
});
export type Player = z.infer<typeof playerSchema>;

export const datasetSchema = z.strictObject({
  version: z.string().regex(/^\d{4}\.\d{2}\.\d+$/), // "2027.01.1": year.month.patch
  generatedAt: z.string(),
  players: z.array(playerSchema),
});
export type Dataset = z.infer<typeof datasetSchema>;

export const isKeeperStats = (s: Player["stats"]): s is KeeperStats => "stp" in s;
