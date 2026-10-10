import { isKeeperStats, type Player, type Position } from "./schema.ts";

type Weights = { spd: number; fin: number; pas: number; skl: number; def: number; pow: number };

/** Position OVR weights (player-database.md → "Rating methodology", step 3). */
export const POSITION_WEIGHTS: Record<Exclude<Position, "GK">, Weights> = {
  ST: { spd: 0.15, fin: 0.4, pas: 0.08, skl: 0.17, def: 0.02, pow: 0.18 },
  RW: { spd: 0.25, fin: 0.22, pas: 0.15, skl: 0.28, def: 0.03, pow: 0.07 },
  LW: { spd: 0.25, fin: 0.22, pas: 0.15, skl: 0.28, def: 0.03, pow: 0.07 },
  AM: { spd: 0.1, fin: 0.18, pas: 0.32, skl: 0.3, def: 0.04, pow: 0.06 },
  RM: { spd: 0.22, fin: 0.12, pas: 0.24, skl: 0.22, def: 0.1, pow: 0.1 },
  LM: { spd: 0.22, fin: 0.12, pas: 0.24, skl: 0.22, def: 0.1, pow: 0.1 },
  CM: { spd: 0.08, fin: 0.08, pas: 0.34, skl: 0.22, def: 0.16, pow: 0.12 },
  DM: { spd: 0.06, fin: 0.03, pas: 0.26, skl: 0.12, def: 0.35, pow: 0.18 },
  RB: { spd: 0.2, fin: 0.02, pas: 0.16, skl: 0.1, def: 0.36, pow: 0.16 },
  LB: { spd: 0.2, fin: 0.02, pas: 0.16, skl: 0.1, def: 0.36, pow: 0.16 },
  RWB: { spd: 0.24, fin: 0.04, pas: 0.2, skl: 0.14, def: 0.26, pow: 0.12 },
  LWB: { spd: 0.24, fin: 0.04, pas: 0.2, skl: 0.14, def: 0.26, pow: 0.12 },
  CB: { spd: 0.1, fin: 0.01, pas: 0.09, skl: 0.05, def: 0.5, pow: 0.25 },
};

/** The OVR the face stats give for the primary position, before the reputation adjustment. */
export function formulaOvr(p: Pick<Player, "positions" | "stats">): number {
  const s = p.stats;
  if (isKeeperStats(s))
    return Math.round(
      0.3 * s.stp + 0.22 * s.rct + 0.16 * s.hdl + 0.14 * s.cmd + 0.08 * s.dst + 0.1 * s.agi,
    );
  const pos = p.positions[0] as Exclude<Position, "GK">;
  const w = POSITION_WEIGHTS[pos];
  return Math.round(
    w.spd * s.spd + w.fin * s.fin + w.pas * s.pas + w.skl * s.skl + w.def * s.def + w.pow * s.pow,
  );
}

/** Reputation adjustment allowed on top of the formula (step 4), plus 1 for rounding. */
export const OVR_TOLERANCE = { below: 3, above: 3 } as const;
