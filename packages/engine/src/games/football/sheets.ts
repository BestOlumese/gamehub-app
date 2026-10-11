// Turning a drafted team into a match sheet (best known role in each slot, default tactics).
import { type Pool } from "./draft";
import { DEFAULT_TACTICS, type Lookup, type TeamSheet, type Tactics } from "./match";
import { bestRole, formation } from "./pitch";
import type { FootballPlayer } from "./types";

export function sheetOf(
  team: { formation: number; xi: Record<number, string>; subs: string[] },
  pool: Pool,
  tactics: Tactics = DEFAULT_TACTICS,
): TeamSheet {
  const slots = formation(team.formation).slots;
  return {
    formation: team.formation,
    xi: slots.map((s, i) => {
      const id = team.xi[i] as string;
      return { id, role: bestRole(pool.byId.get(id) as FootballPlayer, s.pos) };
    }),
    bench: [...team.subs],
    tactics,
  };
}

/** A card lookup over the pool (throws on an unknown id: a bug, never data from clients). */
export const lookupOf =
  (pool: Pool): Lookup =>
  (id) => {
    const p = pool.byId.get(id);
    if (!p) throw new Error(`unknown player ${id}`);
    return p;
  };
