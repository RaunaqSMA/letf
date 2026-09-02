/**
 * Deterministic pseudo-random generators.
 *
 * Monte Carlo reproducibility is a hard requirement: identical seed +
 * identical configuration must yield bit-identical results. We therefore never
 * use Math.random() anywhere in the simulation engines.
 */

/** Mulberry32 — small, fast, good enough for resampling. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Converts an arbitrary string seed into a 32-bit integer seed. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  normal(): number;
}

export function createRng(seed: number | string): Rng {
  const s = typeof seed === "string" ? hashSeed(seed) : seed;
  const next = mulberry32(s);
  let spare: number | null = null;
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive) % Math.max(1, maxExclusive),
    /** Box-Muller standard normal. */
    normal() {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      let u = 0;
      let v = 0;
      let s2 = 0;
      do {
        u = next() * 2 - 1;
        v = next() * 2 - 1;
        s2 = u * u + v * v;
      } while (s2 === 0 || s2 >= 1);
      const mul = Math.sqrt((-2 * Math.log(s2)) / s2);
      spare = v * mul;
      return u * mul;
    },
  };
}
