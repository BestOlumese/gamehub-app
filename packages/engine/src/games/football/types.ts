// Football Draft player cards and the dataset, as the engine sees them. The engine never imports
// @gamehub/football-data (engine → nothing): the realtime Worker passes the data in, and these
// types match its records structurally (docs/games/football-draft/player-database.md).

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

export type OutfieldStats = {
  spd: number;
  fin: number;
  pas: number;
  skl: number;
  def: number;
  pow: number;
};
export type KeeperStats = {
  stp: number;
  rct: number;
  hdl: number;
  cmd: number;
  dst: number;
  agi: number;
};

export type FootballPlayer = {
  id: string;
  name: string;
  short: string;
  group: "current" | "legend" | "wonderkid";
  positions: Position[];
  ovr: number;
  stats: OutfieldStats | KeeperStats;
  nation: string;
  club: string | null;
  league?: string | null;
  era: string | null;
  potential: "high" | "elite" | null;
  foot?: "R" | "L" | "B";
  roles: Partial<Record<Role, "plus" | "plusplus">>;
};

export type FootballDataset = { version: string; players: FootballPlayer[] };

export const isKeeperStats = (s: FootballPlayer["stats"]): s is KeeperStats => "stp" in s;
