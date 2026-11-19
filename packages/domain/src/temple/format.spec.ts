import { describe, expect, it } from 'vitest';

import { appendLine, formatLessonLine, removeLines } from './format.ts';
import { parseScripture } from './parse.ts';
import { scopeOf } from './__fixtures__/report.ts';
import type { LessonId } from '../core/ids.ts';
import type { LessonLineFields } from './format.ts';

const ID = 'L_20261119_4k2pqz' as LessonId;

const roundTrip = (fields: LessonLineFields): LessonLineFields => {
  const [line] = parseScripture(formatLessonLine(fields), 'temple').lessons;
  return {
    id: line?.id ?? null,
    scope: line?.scope ?? {},
    fail_kind: line?.fail_kind ?? null,
    cli: line?.cli ?? null,
    text: line?.text ?? '',
  };
};

describe('formatLessonLine', () => {
  it('writes the id, the head in the grammar order and the sentence', () => {
    const fields: LessonLineFields = {
      id: ID,
      scope: scopeOf({ tag: ['docs'], role: ['verifier'], tribe: ['codex', 'claude'] }),
      fail_kind: 'tests_fail',
      cli: '2.1.327',
      text: 'Compare commits with `git diff <base>...HEAD`.',
    };
    expect(formatLessonLine(fields)).toBe(
      '- [L_20261119_4k2pqz] {role=verifier tribe=codex,claude tag=docs fail_kind=tests_fail cli=2.1.327} Compare commits with `git diff <base>...HEAD`.',
    );
    expect(roundTrip(fields)).toEqual(fields);
  });

  it('writes a bare line without id or head', () => {
    const fields: LessonLineFields = {
      id: null,
      scope: {},
      fail_kind: null,
      cli: null,
      text: 'Read the file first.',
    };
    expect(formatLessonLine(fields)).toBe('- Read the file first.');
    expect(roundTrip(fields)).toEqual(fields);
  });

  it.each<[string, Pick<LessonLineFields, 'id' | 'text'>, string]>([
    ['a brace', { id: ID, text: '{curly} first.' }, '- [L_20261119_4k2pqz] {} {curly} first.'],
    ['an id-like start without id', { id: null, text: '[L_x] is no id.' }, '- {} [L_x] is no id.'],
    [
      'an id-like start with an id',
      { id: ID, text: '[L_x] is no id.' },
      '- [L_20261119_4k2pqz] [L_x] is no id.',
    ],
  ])('guards a sentence that starts with %s', (_, partial, written) => {
    const fields: LessonLineFields = {
      scope: {},
      fail_kind: null,
      cli: null,
      ...partial,
    };
    expect(formatLessonLine(fields)).toBe(written);
    expect(roundTrip(fields)).toEqual(fields);
  });
});

describe('appendLine', () => {
  it.each([
    ['an empty file', '', '- a\n'],
    ['a file of a mark alone', '﻿', '﻿- a\n'],
    ['a file that ends a line', '# T\n', '# T\n- a\n'],
    ['a file whose last line has no end', '# T', '# T\n- a\n'],
    ['a file of CRLF', '# T\r\n- b', '# T\r\n- b\r\n- a\r\n'],
  ])('appends to %s', (_, text, after) => {
    expect(appendLine(text, '- a')).toBe(after);
  });
});

describe('removeLines', () => {
  it('takes the numbered lines out and leaves the rest byte for byte', () => {
    expect(removeLines('# T\r\n- a\r\n- b\r\n\r\n- c', [2, 5])).toBe('# T\r\n- b\r\n\r\n');
  });

  it('keeps a byte-order mark when the first line goes', () => {
    expect(removeLines('﻿- a\n- b\n', [1])).toBe('﻿- b\n');
  });

  it('leaves an empty file when the only line goes, and an empty one as it is', () => {
    expect(removeLines('- a\n', [1])).toBe('');
    expect(removeLines('', [1])).toBe('');
  });
});
