import { describe, expect, it } from 'vitest';

import examples from '../../examples/tribe-looks.json' with { type: 'json' };
import { TribeLookPoolSchema } from './tribe-look.ts';

const [example] = examples;

/** `ok`, or each issue as `path: message`. */
const verdictOf = (value: unknown) => {
  const result = TribeLookPoolSchema.safeParse(value);
  return result.success
    ? ['ok']
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('TribeLookPoolSchema', () => {
  it('takes the example pool of an owner theme', () => {
    expect(verdictOf(example)).toEqual(['ok']);
  });

  it('wants every list non-empty and its ids unique, kebab-case', () => {
    expect(verdictOf({ ...example, auras: [], pinned: {} })).toEqual([expect.stringMatching(/^auras: /)]);
    expect(verdictOf({ ...example, figures: [{ id: 'tall' }, { id: 'tall' }], pinned: {} })).toEqual([
      'figures.1.id: duplicate id "tall"',
    ]);
    expect(verdictOf({ ...example, crests: [{ id: 'Anchor' }] }).join()).toContain('crests.0.id');
  });

  it('wants each palette as two colours of the design system, night and day', () => {
    const palettes = [{ id: 'silver', night: 'teal', day: '#176E6A' }];
    expect(verdictOf({ ...example, palettes })).toEqual([expect.stringMatching(/^palettes\.0\.night: /)]);
  });

  it('refuses a pinned entry whose part is not in the pool', () => {
    const pinned = { claude: { ...example?.pinned.claude, crest: 'kraken', frame: 'oval' } };
    expect(verdictOf({ ...example, pinned })).toEqual([
      'pinned.claude.crest: no crest "kraken" in the pool',
      'pinned.claude.frame: no frame "oval" in the pool',
    ]);
  });

  it('refuses two pinned entries with one palette or one crest: they would look alike', () => {
    const claude = example?.pinned.claude;
    const pinned = { claude, gemini: { ...claude, palette: 'red' }, codex: { ...claude, crest: 'gull' } };
    expect(verdictOf({ ...example, pinned })).toEqual([
      'pinned.gemini.crest: crest "anchor" is pinned to claude already',
      'pinned.codex.palette: palette "silver" is pinned to claude already',
    ]);
  });
});
