// The text of scripture as the Steward writes it (PS-12c, temple-first plan "Văn phạm"): a line in the grammar the
// parser reads, so `parseScripture(formatLessonLine(x))` gives `x` back; and the two edits it makes on a file, one line
// appended at the end or lines taken out, which leave every other character of the file as it was (the owner's lines
// are never changed, ADR 0027).
import { LESSON_SCOPE_KEYS } from '../schema/lesson/scope.ts';
import type { ScriptureLine } from './parse.ts';

/** What a line says: its id, scope head, fail kind, CLI version and sentence. */
export type LessonLineFields = Pick<ScriptureLine, 'id' | 'scope' | 'fail_kind' | 'cli' | 'text'>;

const BOM = '﻿';

/** `role=verifier tribe=codex,claude fail_kind=tests_fail`, the keys in the grammar's order. */
function headOf(line: LessonLineFields): string {
  const pairs = LESSON_SCOPE_KEYS.flatMap((key) => {
    const values = line.scope[key];
    return values === undefined ? [] : [`${key}=${values.join(',')}`];
  });
  if (line.fail_kind !== null) pairs.push(`fail_kind=${line.fail_kind}`);
  if (line.cli !== null) pairs.push(`cli=${line.cli}`);
  return pairs.join(' ');
}

/**
 * `- [L_…] {head} sentence`. A sentence that starts like a head (`{`), or like an id on a line without one (`[L_`), is
 * written after an empty head `{}`, which the parser reads as no scope.
 */
export function formatLessonLine(line: LessonLineFields): string {
  const head = headOf(line);
  const guarded = line.text.startsWith('{') || (line.id === null && line.text.startsWith('[L_'));
  const parts = [
    '-',
    ...(line.id === null ? [] : [`[${line.id}]`]),
    ...(head === '' && !guarded ? [] : [`{${head}}`]),
    line.text,
  ];
  return parts.join(' ');
}

/** The file's own line ending: CRLF when it has one, else LF. */
const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

/** `text` with `line` appended as its last line; the file's last line gets the ending it lacked. */
export function appendLine(text: string, line: string): string {
  const eol = eolOf(text);
  if (text === '' || text === BOM) return `${text}${line}${eol}`;
  return text.endsWith('\n') ? `${text}${line}${eol}` : `${text}${eol}${line}${eol}`;
}

/**
 * `text` without the lines numbered `numbers` (from 1, as the parser counts them), each with its own line end: every
 * other line keeps its bytes, its end included, and a byte-order mark stays.
 */
export function removeLines(text: string, numbers: readonly number[]): string {
  const marked = text.startsWith(BOM);
  const body = marked ? text.slice(BOM.length) : text;
  const lines = body.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const kept = lines.filter((_, index) => !numbers.includes(index + 1));
  return `${marked ? BOM : ''}${kept.join('')}`;
}
