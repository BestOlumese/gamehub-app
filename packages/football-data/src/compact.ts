import {
  isKeeperStats,
  POSITIONS,
  ROLES,
  type Dataset,
  type Player,
  type Position,
  type Role,
} from "./schema.ts";

// The runtime format for the realtime Worker (player-database.md → "Compact runtime format"):
// one tuple per player plus lookup tables, parsed lazily on the first football action.

/** What the game needs about a player (no research fields: basis, sources). */
export type CardPlayer = {
  id: string;
  name: string;
  short: string;
  positions: Position[];
  ovr: number;
  /** spd fin pas skl def pow, or for keepers stp rct hdl cmd dst agi. */
  stats: [number, number, number, number, number, number];
  keeper: boolean;
  nation: string;
  club: string | null;
  group: Player["group"];
  era: string | null;
  potential: Player["potential"];
  foot: Player["foot"] | null;
  birthYear: number | null;
  roles: Partial<Record<Role, "plus" | "plusplus">>;
};

type Tuple = [
  string, // id
  string, // name
  string, // short
  number, // positions: 4 bits each, primary first, 15 = none
  number, // ovr
  number,
  number,
  number,
  number,
  number,
  number, // six stats
  number, // nation index
  number, // club index, -1 = none
  number, // flags: group (2 bits) | potential << 2 (2) | foot << 4 (2) | keeper << 6
  number, // roles known at "plus" (bit per role)
  number, // roles known at "plusplus"
  number, // era index, -1 = none
  number, // birth year, 0 = unknown
];

export type Compact = {
  v: string;
  nations: string[];
  clubs: string[];
  eras: string[];
  players: Tuple[];
};

const GROUPS = ["current", "legend", "wonderkid"] as const;
const POTENTIAL = [null, "high", "elite"] as const;
const FEET = ["R", "L", "B", null] as const;

export function toCompact(data: Dataset): Compact {
  const nations: string[] = [];
  const clubs: string[] = [];
  const eras: string[] = [];
  const index = (list: string[], x: string) => {
    let i = list.indexOf(x);
    if (i < 0) i = list.push(x) - 1;
    return i;
  };
  const players = data.players.map((p): Tuple => {
    const pos = [0, 1, 2].reduce((acc, k) => {
      const q = p.positions[k];
      return acc | ((q === undefined ? 15 : POSITIONS.indexOf(q)) << (4 * k));
    }, 0);
    const s = p.stats;
    const six = isKeeperStats(s)
      ? [s.stp, s.rct, s.hdl, s.cmd, s.dst, s.agi]
      : [s.spd, s.fin, s.pas, s.skl, s.def, s.pow];
    let plus = 0;
    let plusplus = 0;
    for (const [role, level] of Object.entries(p.roles)) {
      const bit = 2 ** ROLES.indexOf(role as Role);
      if (level === "plusplus") plusplus += bit;
      else plus += bit;
    }
    const flags =
      GROUPS.indexOf(p.group) |
      (POTENTIAL.indexOf(p.potential) << 2) |
      (FEET.indexOf(p.foot ?? null) << 4) |
      ((isKeeperStats(s) ? 1 : 0) << 6);
    return [
      p.id,
      p.name,
      p.short,
      pos,
      p.ovr,
      ...(six as [number, number, number, number, number, number]),
      index(nations, p.nation),
      p.club === null ? -1 : index(clubs, p.club),
      flags,
      plus,
      plusplus,
      p.era === null ? -1 : index(eras, p.era),
      p.birthYear ?? 0,
    ];
  });
  return { v: data.version, nations, clubs, eras, players };
}

export function fromCompact(c: Compact): CardPlayer[] {
  return c.players.map((t) => {
    const [
      id,
      name,
      short,
      pos,
      ovr,
      a,
      b,
      cc,
      d,
      e,
      f,
      nation,
      club,
      flags,
      plus,
      plusplus,
      era,
      born,
    ] = t;
    const positions: Position[] = [];
    for (let k = 0; k < 3; k++) {
      const q = (pos >> (4 * k)) & 15;
      if (q !== 15) positions.push(POSITIONS[q] as Position);
    }
    const roles: Partial<Record<Role, "plus" | "plusplus">> = {};
    ROLES.forEach((role, i) => {
      const bit = 2 ** i;
      if (Math.floor(plusplus / bit) % 2) roles[role] = "plusplus";
      else if (Math.floor(plus / bit) % 2) roles[role] = "plus";
    });
    return {
      id,
      name,
      short,
      positions,
      ovr,
      stats: [a, b, cc, d, e, f],
      keeper: ((flags >> 6) & 1) === 1,
      nation: c.nations[nation] as string,
      club: club < 0 ? null : (c.clubs[club] as string),
      group: GROUPS[flags & 3] as Player["group"],
      era: era < 0 ? null : (c.eras[era] as string),
      potential: POTENTIAL[(flags >> 2) & 3] ?? null,
      foot: FEET[(flags >> 4) & 3] ?? null,
      birthYear: born || null,
      roles,
    };
  });
}
