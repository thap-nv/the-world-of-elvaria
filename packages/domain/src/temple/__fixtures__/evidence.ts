// A hand-made evidence pack for the Temple's specs (PS-12d): groups of failed runs by kind, with notes and the lines of
// scripture the pack shows; ids as text, the brands being the reader's business.
import type { RepeatedFailure, RepeatedMember } from '../../metrics/repeated-failures.ts';
import type { VerdictId } from '../../core/ids.ts';
import type { FailKind } from '../../schema/common.ts';
import type { EvidenceSource, ScriptureEvidenceLine } from '../evidence.ts';

export const verdictId = (n: number): VerdictId => `q_20261119_${String(n).padStart(6, '0')}-1` as VerdictId;

export const member = (n: number): RepeatedMember =>
  ({
    verdict: verdictId(n),
    quest: `q_20261119_${String(n).padStart(6, '0')}`,
    n: 1,
    class: 'knight',
    tribe: 'claude',
    model: 'claude-sonnet-4-6',
    territory: 'elvaria',
    tags: ['docs'],
    lessons: [],
  }) as unknown as RepeatedMember;

/** A group of `count` failed runs of `kind`, its verdicts numbered from `first`. */
export const failure = (kind: FailKind, count: number, first: number): RepeatedFailure => ({
  fail_kind: kind,
  members: Array.from({ length: count }, (_, index) => member(first + index)),
});

export const line = (
  over: Partial<Record<keyof ScriptureEvidenceLine, unknown>> = {},
): ScriptureEvidenceLine =>
  ({
    ref: 'L_20261119_aaaaaa',
    owner: 'temple',
    source: 'monk',
    scope: {},
    fail_kind: 'tests_fail',
    text: 'Run the tests before you hand in.',
    ...over,
  }) as ScriptureEvidenceLine;

export const source = (over: Partial<EvidenceSource> = {}): EvidenceSource => ({
  failures: [],
  notes: new Map(),
  lines: [],
  counts: [],
  checks: {},
  scripts: [],
  ...over,
});
