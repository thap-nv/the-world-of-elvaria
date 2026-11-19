// The failures that repeat (PS-12b, temple-first plan, ADR 0027): among the TEMPLE_WINDOW_RUNS most recent judged runs,
// the kinds of failure that TEMPLE_REPEAT_MIN runs or more share, each with who worked those runs, where, and which
// lessons their prompts carried. It is what the Temple reads before it decides on a rung of the ladder (PS-12d): a run
// that a flaky check failed says nothing of the work, and a fail the owner rejudged or a second judge overturned is no
// fail, so neither counts (lesson-runs.ts).
import { FAIL_KIND_CAUSES } from './causes.ts';
import { TEMPLE_REPEAT_MIN, TEMPLE_WINDOW_RUNS } from './lesson-constants.ts';
import type { EvidenceRun, LessonEvidence } from './lesson-runs.ts';
import type { LessonRef, QuestId, TagId, TerritoryId, VerdictId } from '../core/ids.ts';
import type { FailKind } from '../schema/common.ts';

/** One failed run of a repeated kind. */
export interface RepeatedMember {
  readonly verdict: VerdictId;
  readonly quest: QuestId;
  readonly n: number;
  readonly class: string | null;
  readonly tribe: string | null;
  readonly model: string | null;
  readonly territory: TerritoryId;
  readonly tags: readonly TagId[];
  /** The lessons its first session's prompt carried. */
  readonly lessons: readonly LessonRef[];
}

export interface RepeatedFailure {
  readonly fail_kind: FailKind;
  /** Oldest first. */
  readonly members: readonly RepeatedMember[];
}

const memberOf = (run: EvidenceRun, verdict: VerdictId): RepeatedMember => ({
  verdict,
  quest: run.quest,
  n: run.n,
  class: run.class,
  tribe: run.tribe,
  model: run.model,
  territory: run.territory,
  tags: run.tags,
  lessons: run.lessons,
});

/** The groups of failures of one kind in the recent window, the biggest first, ties by the kind's name. */
export function repeatedFailuresOf(evidence: LessonEvidence): RepeatedFailure[] {
  const recent = evidence.runs.filter(({ result }) => result !== undefined).slice(-TEMPLE_WINDOW_RUNS);
  const groups = new Map<FailKind, RepeatedMember[]>();
  for (const run of recent) {
    // A kind the checks own (flaky) is the machinery's fault, not a lesson's to cure.
    if (run.fail_kind === null || run.verdict === null || FAIL_KIND_CAUSES[run.fail_kind] === 'infra')
      continue;
    groups.set(run.fail_kind, [...(groups.get(run.fail_kind) ?? []), memberOf(run, run.verdict)]);
  }
  return [...groups]
    .filter(([, members]) => members.length >= TEMPLE_REPEAT_MIN)
    .map(([fail_kind, members]) => ({ fail_kind, members }))
    .sort((a, b) => b.members.length - a.members.length || a.fail_kind.localeCompare(b.fail_kind));
}
