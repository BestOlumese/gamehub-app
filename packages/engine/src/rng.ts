import type { Rng } from "./types";

/** cyrb128: spreads any string seed over four 32-bit words. */
function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * Deterministic RNG (sfc32). `seededRng(seed, counter)` resumes the exact stream
 * after `counter` draws, so a room restored from storage replays identically.
 * Not cryptographic; the seed never leaves the server.
 */
export function seededRng(seed: string, counter = 0): Rng {
  let [a, b, c, d] = hashSeed(seed);
  let drawn = 0;

  const next32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    drawn++;
    return t >>> 0;
  };

  for (let i = 0; i < counter; i++) next32();

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
      throw new RangeError(`rng.int: bad bound ${maxExclusive}`);
    }
    // Rejection sampling: no modulo bias.
    const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
    let x = next32();
    while (x >= limit) x = next32();
    return x % maxExclusive;
  };

  return {
    int,
    shuffle<T>(arr: readonly T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
    counter: () => drawn,
  };
}
