// tribeLookOf (PS-24, implementation-plan §2.7, §3.14): the owner's choice, else the theme's pinned entry, else a
// look drawn from the pool by the tribe id, never one neutral look shared by several tribes.
import { describe, expect, it } from 'vitest';

import { TribeIdSchema } from '../core/ids.ts';
import { lookPoolOf } from './look-pools.ts';
import { tribeLookOf, tribeLooksOf } from './look.ts';
import type { TribeId } from '../core/ids.ts';
import type { TribeLookChoice, TribeLookPool } from '../schema/tribe-look.ts';
import type { LookedTribe, TribeLook } from './look.ts';

const found = lookPoolOf('fantasy');
if (!found.ok) throw new Error('the fantasy pool does not parse: look-pools.spec.ts says why');
const FANTASY = found.value;

const id = (text: string): TribeId => TribeIdSchema.parse(text);
const plain = (...ids: string[]): LookedTribe[] => ids.map((text) => ({ id: id(text) }));
const pairOf = (look: TribeLook) => `${look.palette}/${look.crest}`;
const partsOf = (look: TribeLook) => [look.palette, look.crest, look.figure, look.aura, look.frame].join('/');

/** Eight tribes the owner might add, in a few orders and mixes. */
const NEWCOMERS = [
  ['codex', 'grok', 'cursor', 'kiro', 'aider', 'qwen', 'mistral', 'llama'],
  ['llama', 'mistral', 'qwen', 'aider', 'kiro', 'cursor', 'grok', 'codex'],
  ['tribe_1', 'tribe_2', 'tribe_3', 'tribe_4', 'tribe_5', 'tribe_6', 'tribe_7', 'tribe_8'],
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  ['local', 'mine', 'work', 'home', 'lab', 'night', 'day', 'spare'],
];

const VIOLET_MOON: TribeLookChoice = {
  palette: 'violet',
  crest: 'moon',
  figure: 'tall',
  aura: 'mist',
  frame: 'arch',
};

describe('tribeLookOf: pinned and drawn looks', () => {
  it('keeps the Silver Star for claude and the Red Fire for gemini, wherever they stand', () => {
    for (const tribes of [plain('claude', 'gemini'), plain('codex', 'gemini', 'grok', 'claude')]) {
      expect(tribeLookOf(FANTASY, tribes, id('claude'))).toEqual({
        tribe: 'claude',
        palette: 'silver',
        crest: 'star',
        figure: 'slender',
        aura: 'glow',
        frame: 'round',
        source: 'pinned',
      });
      expect(tribeLookOf(FANTASY, tribes, id('gemini'))).toMatchObject({
        palette: 'red',
        crest: 'fire',
        source: 'pinned',
      });
    }
  });

  it('draws the same look for the same id on every run: codex after the two tribes of elvaria init', () => {
    // A change here changes the look of every kingdom's codex: the hash and the pool's order are a contract.
    const codex = tribeLookOf(FANTASY, plain('claude', 'gemini', 'codex'), id('codex'));
    expect(codex).toEqual({
      tribe: 'codex',
      palette: 'yellow',
      crest: 'wind',
      figure: 'tall',
      aura: 'rings',
      frame: 'arch',
      source: 'generated',
    });
    expect(tribeLookOf(FANTASY, plain('claude', 'gemini', 'codex'), id('codex'))).toEqual(codex);
  });

  it('gives any eight tribes eight palettes and eight crests, none of them the Silver Star or the Red Fire', () => {
    for (const ids of NEWCOMERS) {
      for (const tribes of [plain(...ids), plain('claude', 'gemini', ...ids)]) {
        const looks = tribeLooksOf(FANTASY, tribes).filter(({ source }) => source === 'generated');
        expect(looks).toHaveLength(ids.length);
        expect(new Set(looks.map(({ palette }) => palette)).size).toBe(ids.length);
        expect(new Set(looks.map(({ crest }) => crest)).size).toBe(ids.length);
        for (const look of looks) {
          expect(['silver', 'red']).not.toContain(look.palette);
          expect(['star', 'fire']).not.toContain(look.crest);
        }
      }
    }
  });

  it('changes no look of the tribes there when a tribe is added, pinned or not', () => {
    const ids = ['claude', 'codex', 'grok', 'cursor'];
    for (const added of ['kiro', 'gemini']) {
      const before = tribeLooksOf(FANTASY, plain(...ids));
      const after = tribeLooksOf(FANTASY, plain(...ids, added));
      expect(after.slice(0, ids.length)).toEqual(before);
      expect(after.at(-1)?.tribe).toBe(added);
    }
  });

  it('gives a tribe the list lacks the look it would get added last', () => {
    const tribes = plain('claude', 'gemini');
    expect(tribeLookOf(FANTASY, tribes, id('codex'))).toEqual(
      tribeLookOf(FANTASY, plain('claude', 'gemini', 'codex'), id('codex')),
    );
  });

  it('pairs a palette with another crest once the pool runs out, then repeats a pair only when all are held', () => {
    const small: TribeLookPool = {
      ...FANTASY,
      palettes: FANTASY.palettes.slice(0, 2),
      crests: FANTASY.crests.slice(0, 2),
      pinned: {},
    };
    const looks = tribeLooksOf(small, plain('a', 'b', 'c', 'd', 'e'));
    expect(new Set(looks.slice(0, 2).map(({ palette }) => palette)).size).toBe(2);
    expect(new Set(looks.slice(0, 2).map(({ crest }) => crest)).size).toBe(2);
    const pairs = looks.map(pairOf);
    expect(new Set(pairs.slice(0, 4)).size).toBe(4);
    expect(pairs.slice(0, 4)).toContain(pairs[4]);
  });
});

describe("tribeLookOf: the owner's choice", () => {
  it('wins over the pinned entry, with its name, and over a draw', () => {
    const tribes: LookedTribe[] = [
      { id: id('claude'), look: { ...VIOLET_MOON, name: 'Nguyệt Tím' } },
      { id: id('codex'), look: { ...VIOLET_MOON, palette: 'rose', crest: 'sun' } },
    ];
    expect(tribeLookOf(FANTASY, tribes, id('claude'))).toEqual({
      tribe: 'claude',
      ...VIOLET_MOON,
      name: 'Nguyệt Tím',
      source: 'owner',
    });
    expect(tribeLookOf(FANTASY, tribes, id('codex'))).toEqual({
      tribe: 'codex',
      ...VIOLET_MOON,
      palette: 'rose',
      crest: 'sun',
      source: 'owner',
    });
  });

  it('is not drawn for another tribe while the pool lasts, even one ahead of it in the list', () => {
    // Ten palettes: two pinned, one chosen, seven left to draw.
    for (const ids of NEWCOMERS) {
      const tribes = [...plain(...ids.slice(0, 7)), { id: id('chosen'), look: VIOLET_MOON }];
      const drawn = tribeLooksOf(FANTASY, tribes).filter(({ source }) => source === 'generated');
      expect(drawn.map(({ palette }) => palette)).not.toContain('violet');
      expect(drawn.map(({ crest }) => crest)).not.toContain('moon');
    }
  });

  it('is set aside whole when a part is not in the pool: the tribe looks as without it, and says which part', () => {
    const odd = { ...VIOLET_MOON, crest: 'kraken', frame: 'oval', name: 'Kraken' };
    const tribes: LookedTribe[] = [
      { id: id('claude'), look: odd },
      { id: id('codex'), look: odd },
    ];
    const plainLooks = tribeLooksOf(FANTASY, plain('claude', 'codex'));
    const looks = tribeLooksOf(FANTASY, tribes);
    expect(looks.map(partsOf)).toEqual(plainLooks.map(partsOf));
    expect(looks.map(({ source }) => source)).toEqual(['pinned', 'generated']);
    expect(looks.map(({ unknown }) => unknown)).toEqual([
      ['crest', 'frame'],
      ['crest', 'frame'],
    ]);
    expect(looks.map(({ name }) => name)).toEqual([undefined, undefined]);
  });
});
