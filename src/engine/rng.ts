// Mulberry32 — small, fast, deterministic PRNG. Same seed = same sequence,
// which we need for reproducible shuffles in tests and for restoring DO state.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle that returns a NEW array and the next rng state. We
// store rng state as a number so the reducer can stay pure and JSON-serializable.
export function shuffle<T>(items: readonly T[], seed: number): { items: T[]; nextSeed: number } {
  const out = items.slice();
  // Use the seed to drive both the RNG calls and to derive the next seed.
  // Advancing the seed by one full sequence call per shuffle means subsequent
  // shuffles with the same starting seed produce different orders.
  const rng = mulberry32(seed);
  let last = 0;
  for (let i = out.length - 1; i > 0; i--) {
    const r = rng();
    last = r;
    const j = Math.floor(r * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  // Advance seed deterministically so callers chaining shuffles get a fresh seed.
  const nextSeed = (seed + Math.floor(last * 0xffff_ffff)) >>> 0 || ((seed + 1) >>> 0);
  return { items: out, nextSeed };
}
