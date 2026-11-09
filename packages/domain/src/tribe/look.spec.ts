import { describe, expect, it } from 'vitest';

import { TribeIdSchema } from '../core/ids.ts';
import { NEUTRAL_TRIBE_LOOK, tribeLookOf } from './look.ts';
import type { TribeLooks } from './look.ts';

// §2.7: the theme's tribes.json, by tribe id.
const LOOKS: TribeLooks = {
  [TribeIdSchema.parse('claude')]: {
    crest: 'tribe-silver',
    color: '--elv-fac-silver',
    name_key: 'tribe.silver',
  },
  [TribeIdSchema.parse('gemini')]: { crest: 'tribe-fire', color: '--elv-fac-fire', name_key: 'tribe.fire' },
};

describe('tribeLookOf', () => {
  it("gives a tribe the theme knows its theme's crest and colour", () => {
    expect(tribeLookOf(LOOKS, TribeIdSchema.parse('gemini'))).toEqual({
      crest: 'tribe-fire',
      color: '--elv-fac-fire',
      name_key: 'tribe.fire',
    });
  });

  it('gives a tribe added after the theme the neutral crest, and no name key, so its id is shown', () => {
    expect(tribeLookOf(LOOKS, TribeIdSchema.parse('codex'))).toBe(NEUTRAL_TRIBE_LOOK);
    expect(NEUTRAL_TRIBE_LOOK).toEqual({ crest: 'tribe-neutral', color: '--elv-ink-2' });
    expect(tribeLookOf({}, TribeIdSchema.parse('claude')).crest).toBe('tribe-neutral');
  });
});
