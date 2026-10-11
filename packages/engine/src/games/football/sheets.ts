// Turning a drafted team into a match sheet (best known role in each slot, default tactics).
import { type Pool } from "./draft";
import { DEFAULT_TACTICS, type TeamSheet, type Tactics } from "./match";
import { bestRole, formation } from "./pitch";
import type { FootballPlayer } from "./types";

export function sheetOf(
  team: { formation: number; xi: Record<number, string>; subs: string[] },
  pool: Pool,
  tactics: Tactics = DEFAULT_TACTICS,
): TeamSheet {
  const slots = formation(team.formation).slots;
  const get = (id: string) => pool.byId.get(id) as FootballPlayer;
  return {
    formation: team.formation,
    xi: slots.map((s, i) => {
      const player = get(team.xi[i] as string);
      return { player, role: bestRole(player, s.pos) };
    }),
    bench: team.subs.map(get),
    tactics,
  };
}
