import { describe, expect, it } from 'vitest';

import { dice } from './dice.ts';

const draws = (seed: number, count = 5) => {
  const roll = dice(seed);
  return Array.from({ length: count }, () => roll.next());
};

describe('dice', () => {
  it('draws the same numbers from the same seed, others from another seed', () => {
    expect(draws(42)).toEqual(draws(42));
    expect(draws(43)).not.toEqual(draws(42));
    expect(draws(7, 1000).every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('draws whole numbers inside the range, both ends included', () => {
    const roll = dice(1);
    const seen = new Set(Array.from({ length: 200 }, () => roll.int([2, 4])));
    expect([...seen].toSorted()).toEqual([2, 3, 4]);
  });

  it('never draws a key of weight 0, and draws the others', () => {
    const roll = dice(3);
    const seen = new Set(Array.from({ length: 200 }, () => roll.weighted({ a: 1, never: 0, b: 3 })));
    expect([...seen].toSorted()).toEqual(['a', 'b']);
  });

  it('refuses an empty choice and weights that add up to nothing', () => {
    expect(() => dice(1).pick([])).toThrow('nothing to pick from');
    expect(() => dice(1).weighted({ a: 0 })).toThrow('add up to nothing');
  });

  it('gives bytes for ids from the same sequence', () => {
    const bytes = dice(9).random.bytes(16);
    expect(bytes).toHaveLength(16);
    expect(bytes).toEqual(dice(9).random.bytes(16));
    expect([...bytes].every((byte) => Number.isInteger(byte) && byte >= 0 && byte < 256)).toBe(true);
  });
});
