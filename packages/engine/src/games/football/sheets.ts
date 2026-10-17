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
      return { id, role: bestRole(playerIn(pool, id) as FootballPlayer, s.pos) };
    }),
    bench: [...team.subs],
    tactics,
  };
}

/**
 * Two managers can draft the same player (each draft only rules out your own picks), and a
 * tournament squad can meet another drafted elsewhere. In a match, the away side's copy is
 * "id~1": the same card under its own id, so every per-player map (ratings, the live pitch)
 * keeps the two apart.
 */
export const ALIAS = "~";
export const baseId = (id: string) => {
  const at = id.indexOf(ALIAS);
  return at < 0 ? id : id.slice(0, at);
};

/** A player by id, aliases included (an alias carries its own id). */
export function playerIn(pool: Pool, id: string): FootballPlayer | undefined {
  const p = pool.byId.get(id);
  if (p) return p;
  const base = pool.byId.get(baseId(id));
  if (!base) return undefined;
  const alias = { ...base, id };
  pool.byId.set(id, alias); // cached: lookups run every match minute
  return alias;
}

/** `b` with any player also in `a` renamed to an alias. */
export function aliasClashes(a: TeamSheet, b: TeamSheet): TeamSheet {
  const taken = new Set([...a.xi.map((x) => x.id), ...a.bench]);
  const rename = (id: string) => (taken.has(id) ? `${baseId(id)}${ALIAS}1` : id);
  if (![...b.xi.map((x) => x.id), ...b.bench].some((id) => taken.has(id))) return b;
  return {
    ...b,
    xi: b.xi.map((x) => ({ ...x, id: rename(x.id) })),
    bench: b.bench.map(rename),
  };
}

/** A card lookup over the pool (throws on an unknown id: a bug, never data from clients). */
export const lookupOf =
  (pool: Pool): Lookup =>
  (id) => {
    const p = playerIn(pool, id);
    if (!p) throw new Error(`unknown player ${id}`);
    return p;
  };
