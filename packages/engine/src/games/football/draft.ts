// The draft: option sets, guarantees, Draft-luck presets and the auto-pick (docs draft.md).
import type { Rng } from "../../types";
import { bestRole, formation, FORMATIONS, GROUP, type Group } from "./pitch";
import { chemistry, slotRating, teamRating, type Placed } from "./team";
import type { FootballDataset, FootballPlayer, Position } from "./types";

export type DraftLuck = "balanced" | "wild" | "elite";

export type Luck = {
  /** Weights for T1 Elite (86+), T2 Star (82–85), T3 Strong (77–81), T4 Solid (72–76), T5 Squad (≤ 71). */
  tiers: readonly [number, number, number, number, number];
  legend: number;
  wonderkid: number;
  /** Every starting-XI set has at least one option this good (subs: 4 lower). */
  floor: number;
  /** Per 1,000 sets: a second Legend is allowed. */
  jackpot: number;
};

/**
 * Tuned on dataset 2026.10.1 (Oct 2026; tuning log in draft.md): 193 Legends against 46 current
 * players rated 86+, so Legends need a much smaller weight than first proposed to keep them special.
 */
export const LUCK: Record<DraftLuck, Luck> = {
  balanced: { tiers: [1, 5, 11, 12, 6], legend: 0.06, wonderkid: 1.3, floor: 80, jackpot: 20 },
  wild: { tiers: [2, 4, 7, 10, 11], legend: 0.12, wonderkid: 1.6, floor: 76, jackpot: 60 },
  elite: { tiers: [5, 8, 8, 2, 0], legend: 0.05, wonderkid: 1.0, floor: 84, jackpot: 30 },
};

export const tierOf = (ovr: number) =>
  ovr >= 86 ? 0 : ovr >= 82 ? 1 : ovr >= 77 ? 2 : ovr >= 72 ? 3 : 4;

/** The players and lookups the draft needs, built once per dataset. */
export type Pool = {
  byId: Map<string, FootballPlayer>;
  /** Players who list the position (primary or alternate). */
  byPos: Record<Position, FootballPlayer[]>;
  /** Players by their primary position's group. */
  byGroup: Record<Group, FootballPlayer[]>;
  /** Captain candidates: Star tier and up, and Legends. */
  stars: FootballPlayer[];
};

export function makePool(data: FootballDataset): Pool {
  const byPos = Object.fromEntries(
    Object.keys(GROUP).map((p) => [p, [] as FootballPlayer[]]),
  ) as Record<Position, FootballPlayer[]>;
  const byGroup: Record<Group, FootballPlayer[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of data.players) {
    for (const pos of p.positions) byPos[pos].push(p);
    byGroup[GROUP[p.positions[0] as Position]].push(p);
  }
  return {
    byId: new Map(data.players.map((p) => [p.id, p])),
    byPos,
    byGroup,
    stars: data.players.filter((p) => p.ovr >= 82 || p.group === "legend"),
  };
}

const playerWeight = (p: FootballPlayer, luck: Luck, legendBoost = 1) =>
  (luck.tiers[tierOf(p.ovr)] as number) *
  (p.group === "legend" ? luck.legend * legendBoost : p.group === "wonderkid" ? luck.wonderkid : 1);

function weightedPick<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T | undefined {
  const w = items.map((t) => Math.max(0, Math.round(weight(t) * 1000)));
  const total = w.reduce((a, b) => a + b, 0);
  if (!items.length) return undefined;
  if (total <= 0) return items[rng.int(items.length)];
  let r = rng.int(total);
  for (let i = 0; i < items.length; i++) {
    r -= w[i] as number;
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Five distinct options from `pool`, never someone already picked, at most one Legend (two on a
 * jackpot), with at least `atLeast` options at `floor` or above (the weakest are swapped out).
 * The order is shuffled, so it carries no information.
 */
function pickSet(
  rng: Rng,
  pool: readonly FootballPlayer[],
  weight: (p: FootballPlayer) => number,
  luck: Luck,
  picked: ReadonlySet<string>,
  floor: number,
  atLeast = 1,
): FootballPlayer[] {
  const free = pool.filter((p) => !picked.has(p.id));
  const jackpot = rng.int(1000) < luck.jackpot;
  const out: FootballPlayer[] = [];
  while (out.length < 5) {
    const legends = out.filter((p) => p.group === "legend").length;
    const allowed = free.filter(
      (p) => !out.includes(p) && (p.group !== "legend" || legends < (jackpot ? 2 : 1)),
    );
    const p = weightedPick(rng, allowed, weight);
    if (!p) break;
    out.push(p);
  }
  for (let need = atLeast - out.filter((p) => p.ovr >= floor).length; need > 0; need--) {
    const strong = free.filter((p) => p.ovr >= floor && !out.includes(p));
    const p = weightedPick(rng, strong, weight);
    if (!p) break;
    let low = -1;
    out.forEach((q, i) => {
      if (q.ovr < floor && (low < 0 || q.ovr < (out[low] as FootballPlayer).ovr)) low = i;
    });
    if (low < 0) break;
    out[low] = p;
  }
  return rng.shuffle(out);
}

/** Formation options: `n` distinct formation ids. */
export const formationOptions = (rng: Rng, n: number) =>
  rng.shuffle(FORMATIONS.map((f) => f.id)).slice(0, n);

/** Captain options: Stars and Legends who can play somewhere in the formation; ≥ 2 rated 86+. */
export function captainOptions(rng: Rng, pool: Pool, formationId: number, luck: Luck) {
  const positions = new Set(formation(formationId).slots.map((s) => s.pos));
  const fit = (p: FootballPlayer) =>
    positions.has(p.positions[0] as Position)
      ? 1
      : p.positions.some((x) => positions.has(x))
        ? 0.5
        : 0;
  const cands = pool.stars.filter((p) => fit(p) > 0);
  return pickSet(rng, cands, (p) => playerWeight(p, luck, 1.5) * fit(p), luck, new Set(), 86, 2);
}

/** Options for a starting slot: players who list the position (primary × 1, alternate × 0.5). */
export function slotOptions(
  rng: Rng,
  pool: Pool,
  pos: Position,
  luck: Luck,
  picked: ReadonlySet<string>,
) {
  let cands = pool.byPos[pos];
  // A thin pool widens to the position's group (out-of-position penalty shown on the card).
  if (cands.filter((p) => !picked.has(p.id)).length < 12) cands = pool.byGroup[GROUP[pos]];
  const fit = (p: FootballPlayer) =>
    p.positions[0] === pos ? 1 : p.positions.includes(pos) ? 0.5 : 0.25;
  return pickSet(rng, cands, (p) => playerWeight(p, luck) * fit(p), luck, picked, luck.floor);
}

/** The bench by position group: 7 subs GK, DEF, DEF, MID, MID, ATT, ATT; 5 subs GK, DEF, MID, MID, ATT. */
export const subGroups = (subs: 5 | 7): Group[] =>
  subs === 7
    ? ["GK", "DEF", "DEF", "MID", "MID", "ATT", "ATT"]
    : ["GK", "DEF", "MID", "MID", "ATT"];

/** Options for a sub: players of that group (by primary position); the floor is 4 lower. */
export const subOptions = (
  rng: Rng,
  pool: Pool,
  group: Group,
  luck: Luck,
  picked: ReadonlySet<string>,
) => pickSet(rng, pool.byGroup[group], (p) => playerWeight(p, luck), luck, picked, luck.floor - 4);

/** Where a captain goes: the first slot matching his primary position, else an alternate. */
export function captainSlots(formationId: number, p: FootballPlayer): number[] {
  const slots = formation(formationId).slots;
  for (const pos of p.positions) {
    const at = slots.flatMap((s, i) => (s.pos === pos ? [i] : []));
    if (at.length) return at;
  }
  return [];
}

/** The XI so far as placed players (best known role in each slot). */
export function placedXi(
  formationId: number,
  xi: Readonly<Record<number, string>>,
  pool: Pool,
): Placed[] {
  const slots = formation(formationId).slots;
  return Object.entries(xi).flatMap(([i, id]) => {
    const player = pool.byId.get(id);
    const slot = slots[Number(i)];
    return player && slot ? [{ player, pos: slot.pos, role: bestRole(player, slot.pos) }] : [];
  });
}

/**
 * Auto-pick fit for a starting slot: the option's rating there (OVR − position penalty + best
 * role's familiarity) + 1 per chemistry point it adds to the team. Ties: higher OVR, then list order.
 */
export function bestForSlot(
  options: readonly FootballPlayer[],
  pos: Position,
  xiSoFar: readonly Placed[],
): FootballPlayer {
  const before = chemistry(xiSoFar).reduce((a, b) => a + b, 0);
  let best = options[0] as FootballPlayer;
  let bestScore = -Infinity;
  for (const p of options) {
    const placed: Placed = { player: p, pos, role: bestRole(p, pos) };
    const after = chemistry([...xiSoFar, placed]).reduce((a, b) => a + b, 0);
    const score = slotRating(placed) + (after - before);
    if (score > bestScore || (score === bestScore && p.ovr > best.ovr)) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

export const highestOvr = (options: readonly FootballPlayer[]) =>
  options.reduce((a, b) => (b.ovr > a.ovr ? b : a), options[0] as FootballPlayer);

/** A whole team drafted with the auto-pick (simulation tests, bots, solo-run opponents). */
export function autoDraft(
  stream: (pick: number) => Rng,
  pool: Pool,
  luck: DraftLuck | Luck,
  subs: 5 | 7 = 7,
): { formation: number; xi: Record<number, string>; subs: string[]; rating: number } {
  const L = typeof luck === "string" ? LUCK[luck] : luck;
  const f = formationOptions(stream(0), 5)[0] as number;
  const slots = formation(f).slots;
  const xi: Record<number, string> = {};
  const picked = new Set<string>();
  const cap = highestOvr(captainOptions(stream(1), pool, f, L));
  const capSlot = captainSlots(f, cap)[0] ?? 0;
  xi[capSlot] = cap.id;
  picked.add(cap.id);
  let n = 2;
  slots.forEach((slot, i) => {
    if (i === capSlot) return;
    const opts = slotOptions(stream(n++), pool, slot.pos, L, picked);
    const p = bestForSlot(opts, slot.pos, placedXi(f, xi, pool));
    xi[i] = p.id;
    picked.add(p.id);
  });
  const bench: string[] = [];
  for (const g of subGroups(subs)) {
    const p = highestOvr(subOptions(stream(n++), pool, g, L, picked));
    bench.push(p.id);
    picked.add(p.id);
  }
  return { formation: f, xi, subs: bench, rating: teamRating(placedXi(f, xi, pool)) };
}
