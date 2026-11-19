import { describe, expect, it } from 'vitest';

import { SESSION, VOCABULARY, lineOf, linesOf } from './__fixtures__/scripture.ts';
import { inScope, lessonVocabularyOf, selectLessons, worstLoadOf } from './select.ts';
import type { LessonProfile } from './select.ts';

const textsOf = (lines: readonly { readonly text: string }[]): string[] => lines.map(({ text }) => text);

describe('inScope (PS-12, DB3)', () => {
  it.each([
    ['no scope', '- Rule.', true],
    ['its role', '- {role=assignee} Rule.', true],
    ['another role', '- {role=verifier} Rule.', false],
    ['its class among others', '- {class=mage,knight} Rule.', true],
    ['another class', '- {class=scribe} Rule.', false],
    ['its tribe', '- {tribe=claude} Rule.', true],
    ['another tribe', '- {tribe=codex} Rule.', false],
    ['its OS', '- {os=win32} Rule.', true],
    ['another OS', '- {os=darwin,linux} Rule.', false],
    ['its territory', '- {territory=dc1-se-team} Rule.', true],
    ['another territory', '- {territory=elvaria} Rule.', false],
    ['one of its tags', '- {tag=docs,i18n} Rule.', true],
    ['none of its tags', '- {tag=api} Rule.', false],
    ['every key matching', '- {role=assignee tribe=claude os=win32 tag=i18n} Rule.', true],
    ['one key of several not matching', '- {role=assignee tribe=codex os=win32} Rule.', false],
    ['a fail kind and a CLI version only: they never filter', '- {fail_kind=style cli=2.1.327} Rule.', true],
  ])('a line with %s: %s', (_, text, expected) => {
    expect(inScope(lineOf(text).scope, SESSION)).toBe(expected);
  });
});

describe('selectLessons (PS-12, DB3, DB4)', () => {
  it('loads the character scripture first, then the temple, each in file order', () => {
    const temple = linesOf(2, 'temple');
    const own = linesOf(2, 'thorn');
    const selection = selectLessons([...temple, ...own], SESSION, VOCABULARY);
    expect(textsOf(selection.loaded)).toEqual([
      'Rule thorn 1.',
      'Rule thorn 2.',
      'Rule temple 1.',
      'Rule temple 2.',
    ]);
  });

  it('leaves out a line of another scope, and a judge line from an assignee but not from a judge', () => {
    const lines = [lineOf('- For all.'), lineOf('- {role=verifier} For judges.')];
    expect(textsOf(selectLessons(lines, SESSION, VOCABULARY).loaded)).toEqual(['For all.']);
    expect(textsOf(selectLessons(lines, SESSION, VOCABULARY).out_of_scope)).toEqual(['For judges.']);
    const judge = selectLessons(lines, { ...SESSION, role: 'verifier' }, VOCABULARY);
    expect(textsOf(judge.loaded)).toEqual(['For all.', 'For judges.']);
  });

  it.each([
    ['an unknown key', '- {rol=verifier} Rule.'],
    ['an unknown role', '- {role=judge} Rule.'],
    ['a class the registry lacks', '- {class=paladin} Rule.'],
    ['a tribe the kingdom lacks', '- {tribe=grok} Rule.'],
    ['a territory the kingdom lacks', '- {territory=nowhere} Rule.'],
    ['a tag the registry lacks', '- {tag=nope} Rule.'],
    ['a head that never closes', '- {role=assignee Rule.'],
    ['a bad id', '- [L_bad] Rule.'],
    ['a hidden character', '- Rule\u200B.'],
    ['no sentence', '- {role=assignee}'],
  ])('never loads a line with %s, even for a session it would match', (_, text) => {
    const selection = selectLessons([lineOf(text)], SESSION, VOCABULARY);
    expect(selection.loaded).toEqual([]);
    expect(selection.unreadable).toHaveLength(1);
  });

  it('loads 40 lines and puts the 41st and later over the cap, the character first', () => {
    const own = linesOf(30, 'thorn');
    const temple = linesOf(12, 'temple');
    const selection = selectLessons([...temple, ...own], SESSION, VOCABULARY);
    expect(selection.loaded).toHaveLength(40);
    expect(selection.loaded.at(-1)?.text).toBe('Rule temple 10.');
    expect(textsOf(selection.over_cap)).toEqual(['Rule temple 11.', 'Rule temple 12.']);
  });

  it('counts the cap after filtering: 50 lines of which 20 are out of scope all fit', () => {
    const lines = [...linesOf(30, 'temple'), ...linesOf(20, 'temple', '{tribe=codex} ')];
    const selection = selectLessons(lines, SESSION, VOCABULARY);
    expect(selection.loaded).toHaveLength(30);
    expect(selection.out_of_scope).toHaveLength(20);
    expect(selection.over_cap).toEqual([]);
  });
});

describe('lessonVocabularyOf', () => {
  it("lists the registry's classes and tags, the kingdom's tribes and territories", () => {
    const vocabulary = lessonVocabularyOf(
      { classes: [{ id: 'knight' }], tags: [{ id: 'i18n' }] },
      { tribes: [{ id: 'claude' }] },
      [{ id: 'elvaria' }],
    );
    expect(vocabulary).toEqual({
      classes: ['knight'],
      tribes: ['claude'],
      territories: ['elvaria'],
      tags: ['i18n'],
    });
  });
});

describe('worstLoadOf (DB4, the 41st line of PS-12c)', () => {
  const profile: LessonProfile = {
    class: 'knight',
    tribe: 'claude',
    os: 'win32',
    territories: ['dc1-se-team', 'elvaria'],
    tags: ['i18n', 'docs', 'api'],
  };

  it('finds the heaviest role and territory, as if the quest carried every tag', () => {
    const lines = [
      lineOf('- For all.'),
      lineOf('- {role=verifier territory=elvaria} Judges of Elvaria.'),
      lineOf('- {role=verifier tag=api} Judges of API quests.'),
      lineOf('- {tribe=codex} Codex only.'),
      lineOf('- {class=paladin} Unreadable.'),
    ];
    expect(worstLoadOf(lines, profile, VOCABULARY)).toEqual({
      lines: 3,
      role: 'verifier',
      territory: 'elvaria',
    });
  });

  it('weighs only the sessions that would load the new line', () => {
    const lines = [lineOf('- {role=verifier} A.'), lineOf('- {role=verifier} B.'), lineOf('- C.')];
    const added = lineOf('- {role=assignee} New.');
    expect(worstLoadOf(lines, profile, VOCABULARY, added)).toEqual({
      lines: 2,
      role: 'assignee',
      territory: 'dc1-se-team',
    });
  });

  it('is null when no session would load the new line, or the character has no territory', () => {
    expect(worstLoadOf([], profile, VOCABULARY, lineOf('- {tribe=codex} New.'))).toBeNull();
    expect(worstLoadOf([lineOf('- A.')], { ...profile, territories: [] }, VOCABULARY)).toBeNull();
  });

  it('sees 41 when a 41st line would load beside 40', () => {
    const lines = linesOf(40, 'temple');
    expect(worstLoadOf(lines, profile, VOCABULARY, lineOf('- New.'))?.lines).toBe(41);
    expect(worstLoadOf(lines, profile, VOCABULARY, lineOf('- {tribe=codex} New.'))).toBeNull();
  });
});
