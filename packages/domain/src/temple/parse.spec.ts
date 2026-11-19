import { describe, expect, it } from 'vitest';

import { lineOf, seededRandom } from './__fixtures__/scripture.ts';
import { parseScripture } from './parse.ts';

const codesOf = (text: string): string[] => lineOf(text).flaws.map(({ code }) => code);

describe('parseScripture (PS-12, temple-first plan "Văn phạm")', () => {
  it('reads a line with an id, a scope head of several values and a sentence', () => {
    const line = lineOf(
      '- [L_20261119_4k2pqz] {role=verifier tribe=codex,claude os=win32 fail_kind=tests_fail cli=0.130.0} Compare commits with `git diff <base>...HEAD`.',
    );
    expect(line).toEqual({
      owner: 'temple',
      line: 1,
      id: 'L_20261119_4k2pqz',
      scope: { role: ['verifier'], tribe: ['codex', 'claude'], os: ['win32'] },
      fail_kind: 'tests_fail',
      cli: '0.130.0',
      text: 'Compare commits with `git diff <base>...HEAD`.',
      flaws: [],
    });
  });

  it('reads a line the owner wrote by hand: no id, no head, the scope empty', () => {
    expect(lineOf('- Write files with LF line endings.', 'thorn')).toEqual({
      owner: 'thorn',
      line: 1,
      id: null,
      scope: {},
      fail_kind: null,
      cli: null,
      text: 'Write files with LF line endings.',
      flaws: [],
    });
  });

  it('reads a head without an id, every scope key, and an empty head as no scope', () => {
    const line = lineOf(
      '- {class=knight,mage territory=dc1-se-team tag=i18n,docs} Run the i18n check before you submit.',
    );
    expect(line.scope).toEqual({
      class: ['knight', 'mage'],
      territory: ['dc1-se-team'],
      tag: ['i18n', 'docs'],
    });
    expect(lineOf('- [L_20261119_4k2pqz] {} Keep it short.')).toMatchObject({ scope: {}, flaws: [] });
  });

  it('skips headings and blank lines, and names the other text as stray', () => {
    const parsed = parseScripture(
      '# Scripture\n\nSome words.\n- A lesson.\n* Not our list mark.\n  - Nested.\n---\n#hashtag',
      'temple',
    );
    expect(parsed.lessons.map(({ line, text }) => [line, text])).toEqual([[4, 'A lesson.']]);
    expect(parsed.stray).toEqual([3, 5, 6, 7, 8]);
  });

  it('reads CRLF files, a byte-order mark and trailing spaces as the same lines', () => {
    const parsed = parseScripture('\uFEFF- First.\r\n- Second.  \r\n', 'temple');
    expect(parsed.lessons.map(({ text, flaws }) => [text, flaws])).toEqual([
      ['First.', []],
      ['Second.', []],
    ]);
  });

  it('keeps a Markdown check box and a bracket that is no id in the sentence', () => {
    expect(lineOf('- [x] Done means pushed.').text).toBe('[x] Done means pushed.');
    expect(lineOf('- [WIP] Do not merge.').text).toBe('[WIP] Do not merge.');
  });

  it.each([
    ['an id of the wrong form', '- [L_2026_abc] Run lint.', ['bad_id']],
    ['an id that never closes', '- [L_20261119_4k2pqz Run lint.', ['bad_id']],
    ['a head that never closes', '- {role=verifier Run lint.', ['bad_head']],
    ['a pair without a value', '- {role} Run lint.', ['bad_head']],
    ['an empty value in a list', '- {tribe=codex,} Run lint.', ['bad_head']],
    ['a key given twice', '- {role=assignee role=verifier} Run lint.', ['bad_head']],
    ['two fail kinds', '- {fail_kind=style,flaky} Run lint.', ['bad_head']],
    ['two CLI versions', '- {cli=1,2} Run lint.', ['bad_head']],
    ['an unknown key', '- {rol=verifier} Run lint.', ['unknown_key']],
    ['an unknown role', '- {role=judge} Run lint.', ['unknown_value']],
    ['an unknown OS', '- {os=windows} Run lint.', ['unknown_value']],
    ['an unknown fail kind', '- {fail_kind=typo} Run lint.', ['unknown_value']],
    ['a class that is no registry id', '- {class=Knight} Run lint.', ['unknown_value']],
    ['a territory that is no slug', '- {territory=DC1} Run lint.', ['unknown_value']],
    ['an item without a sentence', '- {role=verifier}', ['empty_text']],
    ['a bare list mark', '-', ['empty_text']],
    ['a zero-width space', '- Run\u200B lint.', ['hidden_char']],
    ['a right-to-left override', '- Run \u202Elint.', ['hidden_char']],
    ['a carriage return inside the line', '- Run\rlint.', ['hidden_char']],
    ['a tag character', '- Run lint.\u{E0041}', ['hidden_char']],
  ])('flags %s', (_, text, codes) => {
    expect(codesOf(text)).toEqual(codes);
  });

  it('keeps the values it could read of a key that has an unknown one', () => {
    const line = lineOf('- {role=verifier,judge} Run lint.');
    expect(line.scope).toEqual({ role: ['verifier'] });
    expect(line.flaws).toEqual([{ code: 'unknown_value', key: 'role', value: 'judge' }]);
  });

  it('names what a flaw is about', () => {
    expect(lineOf('- {nope} x').flaws).toEqual([{ code: 'bad_head', value: 'nope' }]);
    expect(lineOf('- {os=win32 os=linux} x').flaws).toEqual([{ code: 'bad_head', key: 'os' }]);
    expect(lineOf('- {lang=en} x').flaws).toEqual([{ code: 'unknown_key', key: 'lang' }]);
    expect(lineOf('- [L_bad] x').flaws).toEqual([{ code: 'bad_id', value: 'L_bad' }]);
  });

  it('never throws and never loses a line, whatever the text (property)', () => {
    const alphabet = [
      '-',
      ' ',
      '[',
      ']',
      '{',
      '}',
      '=',
      ',',
      'L_',
      'a',
      '\n',
      '\r',
      '\t',
      '#',
      '\u200B',
      'é',
      '`',
    ];
    const random = seededRandom(12);
    for (let run = 0; run < 2000; run += 1) {
      const length = Math.floor(random() * 40);
      const text = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      const parsed = parseScripture(text, 'temple');
      const items = parsed.lessons.length + parsed.stray.length;
      expect(items).toBeLessThanOrEqual(text.split('\n').length);
      for (const lesson of parsed.lessons) {
        expect(lesson.text).not.toContain('\n');
        // A carriage return or a zero-width space may stay in the sentence, flagged so the line never loads.
        if (/[\r\u200B]/u.test(lesson.text)) expect(lesson.flaws).toContainEqual({ code: 'hidden_char' });
      }
    }
  });
});
