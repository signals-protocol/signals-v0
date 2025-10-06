/**
 * Deterministic pseudo-random number generator based on Park-Miller LCG.
 * Returns values in the range [0, 1).
 */
export function createDeterministicRandom(
  seed: number | bigint | string = 1
): () => number {
  const modulus = 2147483647n;
  const multiplier = 48271n;

  let state = BigInt(seed) % modulus;
  if (state <= 0n) {
    state += modulus - 1n;
  }

  return () => {
    state = (state * multiplier) % modulus;
    return Number(state) / Number(modulus);
  };
}

/**
 * Deterministic incrementer helper for generating sequential identifiers.
 */
export function createIncrementer(start = 1): () => number {
  let current = start;
  return () => current++;
}
