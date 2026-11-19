// Builders for the temple report specs (PS-12c): scripture files with their ledgers, the state and the facts an
// operation is checked against, and the operations themselves.
import { LessonScopeSchema } from '../../schema/lesson/scope.ts';
import { EMPTY_LEDGER } from '../../schema/lesson/scripture.ts';
import { VOCABULARY } from './scripture.ts';
import type { LessonId, Ulid, VerdictId } from '../../core/ids.ts';
import type { LessonScope } from '../../schema/lesson/scope.ts';
import type { ScriptureEntry, ScriptureLedger } from '../../schema/lesson/scripture.ts';
import type { AddOperation, MergeOperation, RetireOperation } from '../../schema/temple/operation.ts';
import type { ScriptureFile } from '../ledger.ts';
import type { EditFacts, TempleCharacter, TempleState } from '../refusal.ts';

/** A scope as the contract reads it: branded ids from plain words. */
export const scopeOf = (scope: Record<string, readonly string[]>): LessonScope =>
  LessonScopeSchema.parse(scope);

export const COMMAND = '01JF0000000000000000000000' as Ulid;
export const NEW_ID = 'L_20261119_n3wn3w' as LessonId;
export const AT = '2026-11-19T10:00:00+07:00';
export const FAIL = 'q_20261118_aaaaaa-1' as VerdictId;
export const PASS = 'q_20261118_bbbbbb-1' as VerdictId;

/** `L_20261118_<six chars of n>`: the n-th line of the Monk. */
export const monkId = (n: number): LessonId => `L_20261118_m${String(n).padStart(5, '0')}` as LessonId;

export const entryOfMonk = (id: LessonId, extra: Partial<ScriptureEntry> = {}): ScriptureEntry => ({
  id,
  source: 'monk',
  source_verdict: FAIL,
  added_at: '2026-11-18T09:00:00+07:00',
  ...extra,
});

export const ledgerOf = (...lessons: ScriptureEntry[]): ScriptureLedger => ({ version: 1, lessons });

/** A file of `owner` with these lines (each a full Markdown line) and this ledger. */
export const fileOf = (owner: string, lines: readonly string[], ledger = EMPTY_LEDGER): ScriptureFile => ({
  owner,
  text: lines.map((line) => `${line}\n`).join(''),
  ledger,
});

/** `count` lines of the Monk in `owner`'s file, ids monkId(from…), each with `head`, and their ledger. */
export function monkFileOf(owner: string, count: number, from = 1, head = ''): ScriptureFile {
  const ids = Array.from({ length: count }, (_, index) => monkId(from + index));
  const lines = ids.map((id, index) => `- [${id}] ${head}Monk rule ${owner} ${String(from + index)}.`);
  return fileOf(owner, lines, ledgerOf(...ids.map((id) => entryOfMonk(id))));
}

export const KNIGHT: TempleCharacter = { id: 'thorn', class: 'knight', tribe: 'claude', suspended: false };
export const JUDGE: TempleCharacter = { id: 'vale', class: 'mage', tribe: 'codex', suspended: false };

export const stateOf = (
  files: readonly ScriptureFile[],
  characters: readonly TempleCharacter[] = [KNIGHT, JUDGE],
): TempleState => ({ files, characters, vocabulary: VOCABULARY, os: 'win32' });

export const factsOf = (extra: Partial<EditFacts> = {}): EditFacts => ({
  command: COMMAND,
  id: NEW_ID,
  at: AT,
  verdicts: new Map([
    [FAIL, 'fail'],
    [PASS, 'pass'],
  ]),
  versions: { claude: '2.1.327', codex: '0.98.0' },
  secret: (text) => text.includes('sk-'),
  ...extra,
});

export const addOf = (extra: Partial<AddOperation> = {}): AddOperation => ({
  op: 'add',
  owner: 'temple',
  fail_kind: 'tests_fail',
  text: 'Run the checks before you hand in.',
  source_verdict: FAIL,
  ...extra,
});

export const retireOf = (lesson: LessonId, why = 'never helped'): RetireOperation => ({
  op: 'retire',
  lesson,
  why,
});

export const mergeOf = (
  lessons: LessonId[],
  extra: Partial<Omit<MergeOperation, 'op'>> = {},
): MergeOperation => ({
  op: 'merge',
  lessons,
  owner: 'temple',
  fail_kind: 'tests_fail',
  text: 'Run every check of the territory before you hand in.',
  source_verdict: FAIL,
  ...extra,
});
