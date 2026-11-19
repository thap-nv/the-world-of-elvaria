// How each kind of failure moves over time (PS-12b, temple-first plan, ADR 0027): the judged runs of the window, oldest
// first, cut into buckets of FAIL_RATE_BUCKET_RUNS, and for each kind how many runs of each bucket failed with it. It
// is the table that shows "a repeated kind falls after at least 20 judgements": the owner reads one row left to right.
// Buckets are cut from the oldest run on, so a bucket never changes once it is full; the newest may still be filling,
// and its `runs` says so.
import { FAIL_KINDS } from '../schema/common.ts';
import { FAIL_RATE_BUCKET_RUNS } from './lesson-constants.ts';
import type { EvidenceRun, LessonEvidence } from './lesson-runs.ts';
import type { FailKind } from '../schema/common.ts';

/** One bucket: the span of its runs (their start times) and how many failed with the row's kind. */
export interface FailRateBucket {
  readonly from: string;
  readonly to: string;
  readonly runs: number;
  readonly failed: number;
}

export interface FailKindRates {
  readonly fail_kind: FailKind;
  /** The runs of the window that failed with it. */
  readonly failed: number;
  /** Oldest first. */
  readonly buckets: readonly FailRateBucket[];
}

interface Bucket {
  from: string;
  to: string;
  readonly runs: EvidenceRun[];
}

/** The judged runs, oldest first (`evidence.runs` is in that order), cut into buckets as they come. */
function bucketsOf(runs: readonly EvidenceRun[]): Bucket[] {
  const buckets: Bucket[] = [];
  for (const run of runs) {
    if (run.result === undefined) continue;
    const open = buckets.at(-1);
    if (open !== undefined && open.runs.length < FAIL_RATE_BUCKET_RUNS) {
      open.runs.push(run);
      open.to = run.started_at;
    } else buckets.push({ from: run.started_at, to: run.started_at, runs: [run] });
  }
  return buckets;
}

/** A row for each kind that failed a run of the window, the most failed first, ties in the order of FAIL_KINDS. */
export function failKindRatesOf(evidence: LessonEvidence): FailKindRates[] {
  const buckets = bucketsOf(evidence.runs);
  return FAIL_KINDS.map((kind) => ({
    fail_kind: kind,
    failed: buckets.flatMap(({ runs }) => runs).filter(({ fail_kind }) => fail_kind === kind).length,
    buckets: buckets.map(({ from, to, runs }) => ({
      from,
      to,
      runs: runs.length,
      failed: runs.filter(({ fail_kind }) => fail_kind === kind).length,
    })),
  }))
    .filter(({ failed }) => failed > 0)
    .sort((a, b) => b.failed - a.failed);
}
