// The look pools Elvaria ships (PS-24): each parses, holds enough for eight tribes besides the pinned ones, and its
// palettes read well on the design system's night and day backgrounds without passing for a quest status colour.
import { describe, expect, inject, it } from 'vitest';

import { TribeIdSchema } from '../core/ids.ts';
import { contrast, deltaE2000, THEMES, tokensOf } from './__fixtures__/colour.ts';
import { lookPoolOf, parseLookPool } from './look-pools.ts';

const css = inject('designCss');
const found = lookPoolOf('fantasy');
if (!found.ok) throw new Error(JSON.stringify(found.error));
const FANTASY = found.value;

/** WCAG 2 AA for text: the tribe colour is also the colour of its name. The design's two tribes give 4.56. */
const MIN_CONTRAST = 4.5;
/** Clearly another colour than a quest status: the design's Red Fire is 8.1 from the infirmary red by day. */
const MIN_FROM_STATUS = 8;
/** Two tribes told apart at a glance. */
const MIN_BETWEEN = 12;
/** The seven quest status colours, and the accent the awaiting_seal tone uses. */
const STATUS_TOKENS = [
  'q-open',
  'q-working',
  'q-review',
  'q-done',
  'q-returned',
  'q-sleep',
  'q-infirmary',
  'accent',
];
const BACKGROUNDS = ['bg', 'surface'];

describe('lookPoolOf', () => {
  it("gives the fantasy pool for kingdom.theme 'fantasy', and says when a theme has none", () => {
    expect(FANTASY.theme).toBe('fantasy');
    expect(lookPoolOf('steampunk')).toEqual({ ok: false, error: { code: 'no_pool', theme: 'steampunk' } });
  });

  it('lists what is wrong with a pool that does not parse', () => {
    const parsed = parseLookPool('broken', { ...FANTASY, version: 2 });
    expect(parsed.ok ? [] : parsed.error).toEqual({
      code: 'invalid_pool',
      theme: 'broken',
      issues: [expect.stringMatching(/^version: /)],
    });
  });
});

describe('the fantasy look pool', () => {
  const pinned = Object.values(FANTASY.pinned);

  it('pins the two tribes of the design: claude the Silver Star, gemini the Red Fire, in their own colours', () => {
    expect(FANTASY.pinned[TribeIdSchema.parse('claude')]).toMatchObject({ palette: 'silver', crest: 'star' });
    expect(FANTASY.pinned[TribeIdSchema.parse('gemini')]).toMatchObject({ palette: 'red', crest: 'fire' });
    const colours = (id: string) => FANTASY.palettes.find((palette) => palette.id === id);
    for (const theme of THEMES) {
      const tokens = tokensOf(css.text, theme);
      expect(colours('silver')?.[theme]).toBe(tokens.get('fac-silver'));
      expect(colours('red')?.[theme]).toBe(tokens.get('fac-fire'));
    }
  });

  it('holds palettes and crests for at least eight tribes besides the pinned ones', () => {
    expect(FANTASY.palettes.length - pinned.length).toBeGreaterThanOrEqual(8);
    expect(FANTASY.crests.length - pinned.length).toBeGreaterThanOrEqual(8);
  });

  for (const theme of THEMES) {
    it(`reads each palette on the ${theme} background, apart from every quest status colour and the others`, () => {
      const tokens = tokensOf(css.text, theme);
      const token = (name: string) => tokens.get(name) ?? `missing --elv-${name}`;
      const problems: string[] = [];
      for (const palette of FANTASY.palettes) {
        const colour = palette[theme];
        for (const background of BACKGROUNDS) {
          const ratio = contrast(colour, token(background));
          if (ratio < MIN_CONTRAST)
            problems.push(`${palette.id} on ${background}: contrast ${ratio.toFixed(2)}`);
        }
        for (const status of STATUS_TOKENS) {
          const distance = deltaE2000(colour, token(status));
          if (distance < MIN_FROM_STATUS)
            problems.push(`${palette.id} near ${status}: ${distance.toFixed(1)}`);
        }
        for (const other of FANTASY.palettes.filter(({ id }) => id !== palette.id)) {
          const distance = deltaE2000(colour, other[theme]);
          if (distance < MIN_BETWEEN) problems.push(`${palette.id} near ${other.id}: ${distance.toFixed(1)}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }

  it('measures as the published formulas do', () => {
    // WCAG 2: black on white is 21:1. CIEDE2000: zero for one colour, symmetric, large across the hue circle.
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(deltaE2000('#8AD8D4', '#8AD8D4')).toBe(0);
    expect(deltaE2000('#FF0000', '#00FF00')).toBeGreaterThan(80);
    expect(deltaE2000('#8AD8D4', '#FF8A60')).toBeCloseTo(deltaE2000('#FF8A60', '#8AD8D4'), 6);
  });
});
