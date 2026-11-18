// The look of a sibling tribe (PS-27b, plans/sibling-tribes.md): a second account of one CLI looks as its root does
// (palette, crest, figure, frame) with the next aura of the pool, its ordinal counted in the order of
// kingdom.tribes[]; a sibling_of that is not valid leaves the tribe a tribe of its own.
import { describe, expect, it } from 'vitest';

import { FANTASY, NEWCOMERS, VIOLET_MOON, id, partsOf, plain } from './__fixtures__/looks.ts';
import { tribeLookOf, tribeLooksOf } from './look.ts';
import { romanOf } from './roman.ts';
import { siblingProblemOf, siblingsOf } from './siblings.ts';
import type { LookedTribe } from './look.ts';

const sibling = (text: string, of: string, more: Partial<LookedTribe> = {}): LookedTribe => ({
  id: id(text),
  sibling_of: id(of),
  ...more,
});

const SILVER_STAR = { palette: 'silver', crest: 'star', figure: 'slender', frame: 'round' };

describe('tribeLookOf: a sibling', () => {
  it("takes the pinned root's parts but the aura, the next one in the pool", () => {
    const tribes = [...plain('claude', 'gemini'), sibling('claude_2', 'claude')];
    expect(tribeLookOf(FANTASY, tribes, id('claude_2'))).toEqual({
      tribe: 'claude_2',
      ...SILVER_STAR,
      aura: 'sparks',
      source: 'sibling',
      siblings: { root: 'claude', ordinal: 2, count: 2 },
    });
    expect(tribeLookOf(FANTASY, tribes, id('claude'))).toEqual({
      tribe: 'claude',
      ...SILVER_STAR,
      aura: 'glow',
      source: 'pinned',
      siblings: { root: 'claude', ordinal: 1, count: 2 },
    });
  });

  it("takes the parts the owner chose for the root, and those drawn for it, the aura going round the pool's end", () => {
    const chosen = [
      { id: id('claude'), look: { ...VIOLET_MOON, name: 'Nguyệt Tím' } },
      sibling('claude_2', 'claude'),
    ];
    expect(tribeLookOf(FANTASY, chosen, id('claude_2'))).toMatchObject({
      palette: 'violet',
      crest: 'moon',
      figure: 'tall',
      aura: 'rings',
      frame: 'arch',
      source: 'sibling',
    });
    // codex draws yellow, wind, tall, rings, arch after the two tribes of elvaria init (look.spec.ts).
    const drawn = [...plain('claude', 'gemini', 'codex'), sibling('codex_2', 'codex')];
    expect(tribeLookOf(FANTASY, drawn, id('codex_2'))).toEqual({
      tribe: 'codex_2',
      palette: 'yellow',
      crest: 'wind',
      figure: 'tall',
      aura: 'glow',
      frame: 'arch',
      source: 'sibling',
      siblings: { root: 'codex', ordinal: 2, count: 2 },
    });
  });

  it('walks the auras glow, sparks, mist, rings, glow for the siblings of claude', () => {
    const tribes = [...plain('claude'), ...['c2', 'c3', 'c4', 'c5'].map((text) => sibling(text, 'claude'))];
    const looks = tribeLooksOf(FANTASY, tribes);
    expect(looks.map(({ aura }) => aura)).toEqual(['glow', 'sparks', 'mist', 'rings', 'glow']);
    expect(looks.map(({ siblings }) => siblings?.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(looks.map(({ siblings }) => siblings?.count)).toEqual([5, 5, 5, 5, 5]);
  });

  it('counts ordinals in the order of the list, a sibling before its root too', () => {
    const tribes = [
      sibling('claude_3', 'claude'),
      ...plain('gemini', 'claude'),
      sibling('claude_2', 'claude'),
    ];
    const looks = tribeLooksOf(FANTASY, tribes);
    expect(looks.map(({ tribe, aura, siblings }) => [tribe, aura, siblings?.ordinal])).toEqual([
      ['claude_3', 'sparks', 2],
      ['gemini', 'sparks', undefined],
      ['claude', 'glow', 1],
      ['claude_2', 'mist', 3],
    ]);
  });

  it('draws a root that stands after its sibling as without the sibling', () => {
    const before = tribeLooksOf(FANTASY, [
      sibling('codex_2', 'codex'),
      ...plain('claude', 'gemini', 'codex'),
    ]);
    expect(before.map(partsOf)).toEqual([
      'yellow/wind/tall/glow/arch',
      'silver/star/slender/glow/round',
      'red/fire/sturdy/sparks/shield',
      'yellow/wind/tall/rings/arch',
    ]);
  });

  it('gives a root no siblings mark while it has no valid sibling', () => {
    expect(tribeLookOf(FANTASY, plain('claude', 'gemini'), id('claude')).siblings).toBeUndefined();
    const lone = [...plain('claude'), sibling('stray', 'nobody')];
    expect(tribeLookOf(FANTASY, lone, id('claude')).siblings).toBeUndefined();
    expect(siblingsOf(lone, { id: id('claude') })).toBeUndefined();
  });

  it('names a sibling by its sibling_name, and ignores a look written on it, which holds nothing', () => {
    const named = sibling('claude_2', 'claude', {
      sibling_name: 'Sao Đêm',
      look: { ...VIOLET_MOON, name: 'Trăng' },
    });
    const tribes = [...plain('claude'), named, ...plain('codex', 'grok', 'cursor')];
    expect(tribeLookOf(FANTASY, tribes, id('claude_2'))).toMatchObject({
      ...SILVER_STAR,
      aura: 'sparks',
      name: 'Sao Đêm',
      source: 'sibling',
    });
    const bare = [...plain('claude'), sibling('claude_2', 'claude'), ...plain('codex', 'grok', 'cursor')];
    expect(tribeLooksOf(FANTASY, tribes).slice(2)).toEqual(tribeLooksOf(FANTASY, bare).slice(2));
  });

  it('holds its aura like any tribe once the walk has passed its root, and nothing before it', () => {
    // c draws sparks after claude alone: the first free aura from where its id starts.
    expect(tribeLookOf(FANTASY, plain('claude', 'c'), id('c')).aura).toBe('sparks');
    const after = [...plain('claude'), sibling('claude_2', 'claude'), ...plain('c')];
    expect(tribeLookOf(FANTASY, after, id('c')).aura).toBe('mist');
    const ahead = [sibling('claude_2', 'claude'), ...plain('claude', 'c')];
    expect(tribeLookOf(FANTASY, ahead, id('c')).aura).toBe('sparks');
  });

  it('changes no look of the tribes there when a sibling is added last, but marks its root', () => {
    for (const ids of NEWCOMERS) {
      for (const tribes of [plain(...ids), plain('claude', 'gemini', ...ids)]) {
        for (const root of [tribes[0]?.id ?? id('x'), tribes.at(-1)?.id ?? id('x')]) {
          const before = tribeLooksOf(FANTASY, tribes);
          const after = tribeLooksOf(FANTASY, [...tribes, sibling('added', root)]);
          expect(after.slice(0, tribes.length).map(partsOf)).toEqual(before.map(partsOf));
          expect(after.slice(0, tribes.length).map(({ source }) => source)).toEqual(
            before.map(({ source }) => source),
          );
          const marked = after.filter(({ siblings }) => siblings !== undefined).map(({ tribe }) => tribe);
          expect(marked).toEqual([root, 'added']);
        }
      }
    }
  });
});

describe('a sibling_of that is not valid', () => {
  const cases: [string, LookedTribe[]][] = [
    ['names no tribe', [...plain('claude', 'gemini'), sibling('mine', 'nobody')]],
    ['names the tribe itself', [...plain('claude', 'gemini'), sibling('mine', 'mine')]],
    [
      'names a sibling',
      [...plain('claude', 'gemini'), sibling('claude_2', 'claude'), sibling('mine', 'claude_2')],
    ],
  ];

  it.each(cases)('%s: the tribe looks as one of its own, its look its own', (_, tribes) => {
    const without = tribes.map((tribe) => (tribe.id === 'mine' ? { id: tribe.id } : tribe));
    expect(tribeLookOf(FANTASY, tribes, id('mine'))).toEqual(tribeLookOf(FANTASY, without, id('mine')));
    expect(tribeLookOf(FANTASY, tribes, id('mine'))).toMatchObject({ source: 'generated' });
    const chosen = tribes.map((tribe) => (tribe.id === 'mine' ? { ...tribe, look: VIOLET_MOON } : tribe));
    expect(tribeLookOf(FANTASY, chosen, id('mine'))).toMatchObject({ ...VIOLET_MOON, source: 'owner' });
  });

  it('says why to doctor, and nothing for a valid or absent one', () => {
    expect(cases.map(([, tribes]) => siblingProblemOf(tribes, tribes.at(-1) ?? { id: id('x') }))).toEqual([
      'no_root',
      'own_root',
      'root_is_sibling',
    ]);
    const valid = [...plain('claude'), sibling('claude_2', 'claude')];
    expect(valid.map((tribe) => siblingProblemOf(valid, tribe))).toEqual([undefined, undefined]);
  });
});

describe('romanOf', () => {
  it('writes 1 to 20, and the subtractive pairs above', () => {
    const numerals = Array.from({ length: 20 }, (_, index) => romanOf(index + 1));
    expect(numerals).toEqual([
      'I',
      'II',
      'III',
      'IV',
      'V',
      'VI',
      'VII',
      'VIII',
      'IX',
      'X',
      'XI',
      'XII',
      'XIII',
      'XIV',
      'XV',
      'XVI',
      'XVII',
      'XVIII',
      'XIX',
      'XX',
    ]);
    expect([40, 49, 90, 400, 1994].map(romanOf)).toEqual(['XL', 'XLIX', 'XC', 'CD', 'MCMXCIV']);
  });
});
