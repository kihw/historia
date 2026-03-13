/**
 * Seeded pseudo-random number generator (Mulberry32).
 * Deterministic: same seed always produces the same sequence.
 */
export function createRNG(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a deterministic integer in [min, max] inclusive.
 */
export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Roll a probability check. Returns true if the roll succeeds.
 */
export function probabilityCheck(
  rng: () => number,
  probability: number
): boolean {
  return rng() < probability;
}

/**
 * Pick a random element from an array.
 */
export function randomPick<T>(rng: () => number, array: T[]): T {
  return array[Math.floor(rng() * array.length)];
}
