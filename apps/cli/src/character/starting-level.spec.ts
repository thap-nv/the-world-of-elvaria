import { describe, expect, it } from 'vitest';

import { startingLevelOf } from './starting-level.ts';

describe('startingLevelOf', () => {
  it('starts a character by how strong its model is, the effort suffix aside (P1-26)', () => {
    expect(startingLevelOf('claude-opus-5-5')).toBe(5);
    expect(startingLevelOf('claude-opus-5-5-high')).toBe(5);
    expect(startingLevelOf('claude-sonnet-5-5')).toBe(4);
    expect(startingLevelOf('gemini-3-pro')).toBe(4);
    expect(startingLevelOf('gemini-4-argon-medium')).toBe(3);
    expect(startingLevelOf('claude-haiku-5-5')).toBe(2);
    expect(startingLevelOf('gemini-3.8-flash-low')).toBe(2);
  });

  it('knows no level for a model of no row, and matches whole words only', () => {
    expect(startingLevelOf('gpt-oss-120b-medium')).toBeUndefined();
    expect(startingLevelOf('propus-1')).toBeUndefined();
  });
});
