// (PS-12g) templeReleasesOf: a character suspended for a fail streak goes free once the report put in a line of the
// streak's fail kind that a next session of it loads; it stays for the owner otherwise.
import { describe, expect, it } from 'vitest';

import { EMPTY_LEDGER } from '../schema/lesson/scripture.ts';
import { VOCABULARY } from './__fixtures__/scripture.ts';
import { SCRIPTURE_LINES_MAX } from './constants.ts';
import { templeReleasesOf } from './release.ts';
import type { CharacterId, ClassId, LessonId, TribeId } from '../core/ids.ts';
import type { ScriptureFile } from './ledger.ts';
import type { ReleaseCandidate, TempleRelease } from './release.ts';

const NEW = 'L_20261119_aaaaaa' as LessonId;
const OLD = 'L_20261118_bbbbbb' as LessonId;
const KAEL = 'kael' as CharacterId;

const KNIGHT: ReleaseCandidate = {
  id: KAEL,
  class: 'knight' as ClassId,
  tribe: 'claude' as TribeId,
  status: 'suspended',
  consecutive_fail: { fail_kind: 'tests_fail', count: 3 },
};

const file = (owner: string, ...lines: string[]): ScriptureFile => ({
  owner,
  text: lines.map((line) => `${line}\n`).join(''),
  ledger: EMPTY_LEDGER,
});
const line = (head: string, id: LessonId = NEW): string => `- [${id}] {${head}} Run the tests first.`;

const input = (over: Partial<TempleRelease> = {}): TempleRelease => ({
  files: [file('temple'), file('kael')],
  added: [NEW],
  characters: [KNIGHT],
  streak: [KAEL],
  vocabulary: VOCABULARY,
  os: 'win32',
  ...over,
});

describe('templeReleasesOf (PS-12g)', () => {
  it('frees the character for a new line of its fail kind in its own scripture', () => {
    const files = [file('temple'), file('kael', line('fail_kind=tests_fail'))];
    expect(templeReleasesOf(input({ files }))).toEqual([KAEL]);
  });

  it('frees it for a new line of the temple whose scope matches it in some territory', () => {
    const files = [file('temple', line('tribe=claude territory=elvaria role=assignee fail_kind=tests_fail'))];
    expect(templeReleasesOf(input({ files }))).toEqual([KAEL]);
  });

  it.each([
    ['another fail kind', line('fail_kind=style')],
    ['another tribe', line('tribe=gemini fail_kind=tests_fail')],
    ["the judge's sessions only", line('role=verifier fail_kind=tests_fail')],
    ['another OS', line('os=darwin fail_kind=tests_fail')],
    ['no fail kind', line('tribe=claude')],
    ['a line the report did not write', line('fail_kind=tests_fail', OLD)],
  ])('keeps it for a line of %s', (_, written) => {
    expect(templeReleasesOf(input({ files: [file('temple', written), file('kael')] }))).toEqual([]);
  });

  it("keeps it for a line of another character's scripture", () => {
    const files = [file('temple'), file('kael'), file('sable', line('fail_kind=tests_fail'))];
    expect(templeReleasesOf(input({ files }))).toEqual([]);
  });

  it('keeps it when the new line is the 41st its sessions would load', () => {
    const full = Array.from({ length: SCRIPTURE_LINES_MAX }, (_, index) => `- Rule ${String(index + 1)}.`);
    const files = [file('temple', line('fail_kind=tests_fail')), file('kael', ...full)];
    expect(templeReleasesOf(input({ files }))).toEqual([]);
  });

  it('keeps it when the operation was refused: no line of the report is in a file', () => {
    expect(templeReleasesOf(input())).toEqual([]);
  });

  it('keeps a character the owner suspended, and frees none that is not suspended', () => {
    const files = [file('temple', line('fail_kind=tests_fail'))];
    expect(templeReleasesOf(input({ files, streak: [] }))).toEqual([]);
    const idle = { ...KNIGHT, status: 'idle' as const };
    expect(templeReleasesOf(input({ files, characters: [idle] }))).toEqual([]);
    const counted = { ...KNIGHT, consecutive_fail: { count: 3 } };
    expect(templeReleasesOf(input({ files, characters: [counted] }))).toEqual([]);
  });
});
