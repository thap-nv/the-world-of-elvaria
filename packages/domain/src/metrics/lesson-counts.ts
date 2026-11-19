// `helped` and `missed` of each lesson (PS-12b, temple-first plan DB6, ADR 0027): counted from the load traces and the
// verdicts, never stored, so they cannot drift from the log (ADR 0020 says the same of titles and every other count).
// `helped` means the run, or the judge's verdict, went on without the failure the line was written to cure; `missed`
// means the failure came anyway. A line that names no kind of failure has loads and nothing else.
import type { EvidenceRun, LessonEvidence } from './lesson-runs.ts';
import type { LessonFact } from './ledger.ts';
import type { LessonRef } from '../core/ids.ts';
import type { FailKind } from '../schema/common.ts';

export interface LessonCount {
  readonly ref: LessonRef;
  /** The kind the line cures, from the scripture; null for a line that names none or that no file has now. */
  readonly fail_kind: FailKind | null;
  /** Runs and judge sessions whose prompt carried the line. */
  readonly loads: number;
  /** Of them, the runs decided without the line's kind of failure, and the judge verdicts that stood. */
  readonly helped: number;
  /** Of them, the runs that failed with the line's kind, and the judge verdicts that were overturned. */
  readonly missed: number;
  /** The first and the last time a prompt carried it, as written in the log. */
  readonly first_at: string;
  readonly last_at: string;
}

type Outcome = 'helped' | 'missed';

interface Tally {
  loads: number;
  helped: number;
  missed: number;
  first_at: string;
  last_at: string;
}

const earlier = (a: string, b: string): string => (Date.parse(a) <= Date.parse(b) ? a : b);
const later = (a: string, b: string): string => (Date.parse(a) >= Date.parse(b) ? a : b);

/** A decided run failed with the line's kind, or did not: a pass, or a fail of another kind, is a help. */
const runOutcome = (run: EvidenceRun, kind: FailKind): Outcome | undefined =>
  run.result === undefined
    ? undefined
    : run.result === 'fail' && run.fail_kind === kind
      ? 'missed'
      : 'helped';

const judgeOutcome = (stood: boolean | undefined): Outcome | undefined =>
  stood === undefined ? undefined : stood ? 'helped' : 'missed';

/** Each lesson any prompt of the window carried, the most loaded first. */
export function lessonCountsOf(evidence: LessonEvidence, facts: readonly LessonFact[]): LessonCount[] {
  const kinds = new Map(facts.map(({ ref, fail_kind }) => [ref, fail_kind]));
  const tallies = new Map<LessonRef, Tally>();
  const add = (ref: LessonRef, at: string, outcome: (kind: FailKind) => Outcome | undefined): void => {
    const kind = kinds.get(ref) ?? null;
    const tally = tallies.get(ref) ?? { loads: 0, helped: 0, missed: 0, first_at: at, last_at: at };
    tally.loads += 1;
    tally.first_at = earlier(tally.first_at, at);
    tally.last_at = later(tally.last_at, at);
    // Without a kind a line cannot say what it helped or missed.
    const result = kind === null ? undefined : outcome(kind);
    if (result !== undefined) tally[result] += 1;
    tallies.set(ref, tally);
  };
  // A line twice in one prompt would be one lesson loaded once.
  for (const run of evidence.runs)
    for (const ref of new Set(run.lessons))
      add(ref, run.loaded_at ?? run.started_at, (kind) => runOutcome(run, kind));
  for (const judgement of evidence.judgements)
    for (const ref of new Set(judgement.lessons)) add(ref, judgement.at, () => judgeOutcome(judgement.stood));
  return [...tallies]
    .map(([ref, tally]) => ({ ref, fail_kind: kinds.get(ref) ?? null, ...tally }))
    .sort((a, b) => b.loads - a.loads || a.ref.localeCompare(b.ref));
}
