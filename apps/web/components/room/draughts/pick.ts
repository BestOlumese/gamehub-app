import type { DraughtsMove } from "@gamehub/engine/draughts";

// Entering a move (decided with Best, Oct 2026): tap a seed, then the square it ends on. Only
// when two different captures end there (different seeds taken) do you tap the hops in order.

const final = (m: DraughtsMove) => m.path[m.path.length - 1] as number;
const outcome = (m: DraughtsMove) => `${final(m)}:${[...m.captured].sort((a, b) => a - b).join()}`;

/** Where the seed on `from` can end up. */
export function finalsFrom(moves: readonly DraughtsMove[], from: number): number[] {
  return [...new Set(moves.filter((m) => m.from === from).map(final))];
}

/** Moves of `from` that end on `to` and follow the hops tapped so far. */
export function candidates(
  moves: readonly DraughtsMove[],
  from: number,
  to: number,
  hops: readonly number[],
): DraughtsMove[] {
  return moves.filter(
    (m) => m.from === from && final(m) === to && hops.every((h, i) => m.path[i] === h),
  );
}

export type Choice =
  /** One outcome: play this move (any route to it). */
  | { move: DraughtsMove }
  /** Different captures end here: tap one of `next` (the next hop). */
  | { next: number[] }
  | null;

/** What tapping `to` with the seed on `from` selected (and `hops` already tapped) leads to. */
export function choose(
  moves: readonly DraughtsMove[],
  from: number,
  to: number,
  hops: readonly number[] = [],
): Choice {
  const c = candidates(moves, from, to, hops);
  if (!c.length) return null;
  if (new Set(c.map(outcome)).size === 1) return { move: c[0] as DraughtsMove };
  const next = new Set<number>();
  for (const m of c) {
    const n = m.path[hops.length];
    // A route that's already complete here is chosen by tapping its last square again.
    if (n === undefined || m.path.length === hops.length) next.add(to);
    else next.add(n);
  }
  return { next: [...next] };
}

/**
 * Tapping `sq` while choosing a route: the move, if that settles it, or the hops so far.
 * Null if `sq` isn't a next hop (the route is dropped).
 */
export function hop(
  moves: readonly DraughtsMove[],
  from: number,
  to: number,
  hops: readonly number[],
  sq: number,
): { move: DraughtsMove } | { hops: number[]; next: number[] } | null {
  const done = candidates(moves, from, to, hops).find(
    (m) => m.path.length === hops.length && sq === to,
  );
  if (done) return { move: done };
  const more = [...hops, sq];
  const c = choose(moves, from, to, more);
  if (!c) return null;
  return "move" in c ? c : { hops: more, next: c.next };
}

/**
 * A typed move: "32-28", "28x19x10" (every landing), or just start and end ("28x10") when
 * that's enough to tell. Returns the move, or why not.
 */
export function parseTyped(
  moves: readonly DraughtsMove[],
  text: string,
): { move: DraughtsMove } | { error: string } {
  const nums = text
    .trim()
    .split(/\s*[-x×:]\s*|\s+/i)
    .filter(Boolean)
    .map(Number);
  if (nums.length < 2 || nums.some((n) => !Number.isInteger(n)))
    return { error: "Type squares like 32-28 or 28x19" };
  const [from, ...path] = nums as [number, ...number[]];
  const exact = moves.find(
    (m) =>
      m.from === from && m.path.length === path.length && m.path.every((x, i) => x === path[i]),
  );
  if (exact) return { move: exact };
  if (path.length === 1) {
    const c = choose(moves, from, path[0] as number);
    if (c && "move" in c) return c;
    if (c) return { error: "More than one way there: type every square, like 28x19x10" };
  }
  return { error: `"${text.trim()}" isn't a legal move here` };
}
