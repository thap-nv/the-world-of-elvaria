// Seeded randomness for fake days: the same seed gives the same day, byte for byte, because randomness enters
// only through this object (ADR 0002). mulberry32 is small and good enough for fake data; never for secrets.
import type { RandomSource } from '@elvaria/domain';

/** Draw counts and odds as data: `{ submit: 70, crash: 10 }`. A weight of 0 is never drawn. */
export type Weights<K extends string> = Readonly<Record<K, number>>;
/** Inclusive bounds of a whole number, e.g. minutes a session takes. */
export type Range = readonly [min: number, max: number];

export interface Dice {
  /** Uniform in [0, 1). */
  next(): number;
  /** A whole number in [min, max]. */
  int(range: Range): number;
  pick<T>(items: readonly T[]): T;
  /** A key drawn with the given weights. */
  weighted<K extends string>(weights: Weights<K>): K;
  /** Bytes for IdSource, so event and quest ids follow the seed too. */
  readonly random: RandomSource;
}

const UINT32 = 2 ** 32;
const BYTE = 256;

/** mulberry32 (Tommy Ettinger): a 32-bit state, one multiply-xorshift step per draw. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32;
  };
}

export function dice(seed: number): Dice {
  const next = mulberry32(seed);
  const int = ([min, max]: Range): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => {
      const item = items[int([0, items.length - 1])];
      // The tables never offer an empty choice; drawing from one is a bug in a scenario.
      if (item === undefined) throw new Error('dice: nothing to pick from');
      return item;
    },
    weighted: (weights) => {
      const entries = Object.entries(weights) as [keyof typeof weights, number][];
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let left = next() * total;
      const found = entries.find(([, weight]) => (left -= weight) < 0);
      if (found === undefined) throw new Error('dice: weights add up to nothing');
      return found[0];
    },
    random: { bytes: (count) => Uint8Array.from({ length: count }, () => Math.floor(next() * BYTE)) },
  };
}
