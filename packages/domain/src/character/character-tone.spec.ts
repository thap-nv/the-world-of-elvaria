import { describe, expect, it } from 'vitest';

import { CHARACTER_STATUSES } from '../schema/character/character.ts';
import { CHARACTER_TONES, characterToneOf } from './character-tone.ts';

describe('characterToneOf', () => {
  it('draws no icon for an idle character and one of the six design icons otherwise (§2.7)', () => {
    expect(Object.fromEntries(CHARACTER_STATUSES.map((status) => [status, characterToneOf(status)]))).toEqual(
      {
        idle: null,
        working: 'working',
        reviewing: 'reviewing',
        sleeping_mana: 'sleeping',
        meditating: 'meditating',
        suspended: 'suspended',
        swamp: 'swamp',
      },
    );
  });

  it('uses every icon once', () => {
    const tones = CHARACTER_STATUSES.map(characterToneOf).filter((tone) => tone !== null);
    expect([...tones].sort()).toEqual([...CHARACTER_TONES].sort());
  });
});
