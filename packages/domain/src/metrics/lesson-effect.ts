// Whether a lesson changed anything (PS-12b, temple-first plan, ADR 0027): the rate of the failure it cures among the
// runs it was written for, before the first prompt that carried it and among the runs that carried it. The ledger
// proposes no threshold and removes no line (DB14): it prints two rates and the number of runs behind each, and says
// `too_early` until the second has FAIL_RATE_BUCKET_RUNS of them, so a few lucky runs never pass for a cure.
import { inScope } from '../temple/select.ts';
import { FAIL_RATE_BUCKET_RUNS } from './lesson-constants.ts';
import { lessonCountsOf } from './lesson-counts.ts';
import type { LessonCount } from './lesson-counts.ts';
import type { EvidenceRun, LessonEvidence } from './lesson-runs.ts';
import type { LessonFact } from './ledger.ts';
import type { LessonSession } from '../temple/select.ts';
import type { FailKind } from '../schema/common.ts';

const PERCENT = 100;

/** Judged runs, and those that failed with the kind. */
export interface RateSide {
  readonly runs: number;
  readonly failed: number;
}

export interface LessonEffect {
  /** `measured` carries a number; `too_early` has too few runs with the line, `no_baseline` none before it. */
  readonly result: 'too_early' | 'no_baseline' | 'measured';
  /** The runs in the line's scope before the first prompt that carried it. */
  readonly before: RateSide;
  /** The runs that carried it. */
  readonly with: RateSide;
  /** The change in the kind's failure rate, in points of a hundred; negative: it fell. Null unless `measured`. */
  readonly points: number | null;
}

export interface LessonRow extends LessonCount {
  /** Null for a line that names no kind, a line only judges read, and a line no run of the window carried. */
  readonly effect: LessonEffect | null;
}

const sideOf = (runs: readonly EvidenceRun[], kind: FailKind): RateSide => ({
  runs: runs.length,
  failed: runs.filter(({ result, fail_kind }) => result === 'fail' && fail_kind === kind).length,
});

/**
 * The run as a session the line's scope is matched against. The ledger does not know the OS a run ran on, so the key is
 * taken as met: `os` filters nothing here, which a kingdom on one machine, as the real one is, never notices.
 */
const sessionOf = (run: EvidenceRun, os: string): LessonSession => ({
  role: 'assignee',
  class: run.class ?? '',
  tribe: run.tribe ?? '',
  os,
  territory: run.territory,
  tags: run.tags,
});

/**
 * The effect of one line on the failures of its kind, over the runs of `evidence`. A line a judge alone reads
 * (`role=verifier`) has no assignee run to measure, and a line without a kind no failure to count: null for both, as
 * for a line no run carried (a judge's verdicts that stood or fell are in its `helped` and `missed`).
 */
export function lessonEffectOf(evidence: LessonEvidence, fact: LessonFact): LessonEffect | null {
  const { fail_kind: kind, scope, ref } = fact;
  if (kind === null || (scope.role !== undefined && !scope.role.includes('assignee'))) return null;
  const first = evidence.runs.find(({ lessons }) => lessons.includes(ref));
  if (first === undefined) return null;
  const decided = evidence.runs.filter(({ result }) => result !== undefined);
  const os = scope.os?.[0] ?? '';
  const before = sideOf(
    decided.filter(
      (run) =>
        Date.parse(run.started_at) < Date.parse(first.started_at) && inScope(scope, sessionOf(run, os)),
    ),
    kind,
  );
  const carried = sideOf(
    decided.filter(({ lessons }) => lessons.includes(ref)),
    kind,
  );
  if (carried.runs < FAIL_RATE_BUCKET_RUNS)
    return { result: 'too_early', before, with: carried, points: null };
  if (before.runs === 0) return { result: 'no_baseline', before, with: carried, points: null };
  const points = Math.round(PERCENT * (carried.failed / carried.runs - before.failed / before.runs));
  return { result: 'measured', before, with: carried, points };
}

/** Each lesson of the window with its counts and its effect. */
export function lessonRowsOf(evidence: LessonEvidence, facts: readonly LessonFact[]): LessonRow[] {
  const byRef = new Map(facts.map((fact) => [fact.ref, fact]));
  return lessonCountsOf(evidence, facts).map((count) => {
    const fact = byRef.get(count.ref);
    return { ...count, effect: fact === undefined ? null : lessonEffectOf(evidence, fact) };
  });
}
