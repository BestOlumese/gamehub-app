// Fixtures: round robin (circle method) and knockout brackets (modes.md).
import type { Rng } from "../../types";

export type Pair = { a: number; b: number | "bye" };

/** Round robin by the circle method: N − 1 rounds (N even) or N rounds with a bye each (N odd). */
export function roundRobin(n: number): Pair[][] {
  const ids: Array<number | "bye"> = Array.from({ length: n }, (_, i) => i);
  if (n % 2) ids.push("bye");
  const m = ids.length;
  const rounds: Pair[][] = [];
  for (let r = 0; r < m - 1; r++) {
    const round: Pair[] = [];
    for (let i = 0; i < m / 2; i++) {
      const x = ids[i] as number | "bye";
      const y = ids[m - 1 - i] as number | "bye";
      if (x === "bye") round.push({ a: y as number, b: "bye" });
      else if (y === "bye") round.push({ a: x, b: "bye" });
      else round.push(r % 2 ? { a: y, b: x } : { a: x, b: y });
    }
    rounds.push(round);
    // Rotate all but the first.
    ids.splice(1, 0, ids.pop() as number | "bye");
  }
  return rounds;
}

/** A random first knockout round: byes go to the first seeds when N isn't a power of two. */
export function bracket(n: number, rng: Rng): Pair[] {
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  let size = 1;
  while (size < n) size *= 2;
  const byes = size - n;
  const pairs: Pair[] = [];
  let i = 0;
  for (let k = 0; k < byes; k++) pairs.push({ a: order[i++] as number, b: "bye" });
  while (i < n) pairs.push({ a: order[i++] as number, b: order[i++] as number });
  return pairs;
}
