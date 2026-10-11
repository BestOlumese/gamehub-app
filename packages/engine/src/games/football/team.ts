// Effective ratings, chemistry and team rating (tactics.md, draft.md).
import { familiarity, positionPenalty } from "./pitch";
import type { FootballPlayer, Position, Role } from "./types";

export type Placed = { player: FootballPlayer; pos: Position; role: Role };

const tier = (n: number, steps: readonly [number, number, number]) =>
  n >= steps[2] ? 3 : n >= steps[1] ? 2 : n >= steps[0] ? 1 : 0;

/**
 * Chemistry points (0–3) for each starter, in order: shared nation (2/5/8 players), club (2/4/7)
 * and league (3/5/8). Legends link by nation only and count twice there. Out of position: 0.
 */
export function chemistry(xi: readonly Placed[]): number[] {
  const nations = new Map<string, number>();
  const clubs = new Map<string, number>();
  const leagues = new Map<string, number>();
  const add = (m: Map<string, number>, k: string | null | undefined, n: number) => {
    if (k) m.set(k, (m.get(k) ?? 0) + n);
  };
  for (const { player: p } of xi) {
    const legend = p.group === "legend";
    add(nations, p.nation, legend ? 2 : 1);
    if (!legend) {
      add(clubs, p.club, 1);
      add(leagues, p.league, 1);
    }
  }
  return xi.map(({ player: p, pos }) => {
    if (!p.positions.includes(pos)) return 0;
    const legend = p.group === "legend";
    const pts =
      tier(nations.get(p.nation) ?? 0, [2, 5, 8]) +
      (legend || !p.club ? 0 : tier(clubs.get(p.club) ?? 0, [2, 4, 7])) +
      (legend || !p.league ? 0 : tier(leagues.get(p.league) ?? 0, [3, 5, 8]));
    return Math.min(3, pts);
  });
}

/** What chemistry adds to a starter's effective rating: 0 → −2, 1 → 0, 2 → +1, 3 → +2. */
export const CHEM_MOD = [-2, 0, 1, 2] as const;

/** A starter's rating in his slot before chemistry and fatigue: OVR − position penalty + familiarity. */
export const slotRating = (x: Placed) =>
  x.player.ovr - positionPenalty(x.player, x.pos) + familiarity(x.player, x.role);

/**
 * Team rating, as on the card: the mean of the starters' OVR less any position penalty, plus a
 * small boost for stars, round(mean + 0.1 × Σ max(0, rating − mean)). Familiarity and chemistry
 * count in matches but are shown on their own (tuning, Oct 2026: with them in, every drafted team
 * looked like a world XI). Subs don't count.
 */
export function teamRating(xi: readonly Placed[]): number {
  if (!xi.length) return 0;
  const r = xi.map((x) => x.player.ovr - positionPenalty(x.player, x.pos));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.round(mean + 0.1 * r.reduce((a, b) => a + Math.max(0, b - mean), 0));
}
