// The late machine verdict (ADR 0033, plans/check-modes.md "Lần trượt muộn"): a check that first ran after a run's
// pass (the delivery queue, a train, the patrol of the base branch) turned red through the quest's own change. It is
// a machine verdict like any other, measured as principle 14 asks, in a file of its own beside the pass it
// overturns; and it names who shares the fail: the judge whose pass it overturns, never the machine nor the owner.
import { err, ok } from '../core/result.ts';
import { MACHINE_VERIFIER, USER_VERIFIER, VerdictSchema } from '../schema/quest/verdict.ts';
import { failedChecksNote } from './pass-rule.ts';
import { lateVerdictIdOf } from './verdict-id.ts';
import type { CharacterId, RitualId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict, VerdictCheck } from '../schema/quest/verdict.ts';

/** A check that ran red after the verdict, with the first error line of its log when the Steward found one. */
export interface LateCheck {
  readonly check: VerdictCheck;
  readonly error_line?: string;
}

export interface LateReview {
  readonly quest: Pick<Quest, 'id'>;
  /** The run whose pass the red checks overturn. */
  readonly n: number;
  /** The ritual of the quest's kind. */
  readonly ritual: RitualId;
  /** The checks of the late run; only the red ones enter the verdict. */
  readonly checks: readonly LateCheck[];
  /** ISO 8601 in kingdom.tz. */
  readonly at: string;
}

/** `invalid_verdict` only when the inputs break the verdict schema (a run below 1, a time without offset). */
export type LateVerdictError = { readonly code: 'no_red_check' } | { readonly code: 'invalid_verdict' };

/** The check and its log, as any failing check reads (failedChecksNote), then the line that says why. */
const noteOf = ({ check, error_line: line }: LateCheck): string =>
  [failedChecksNote([check]), ...(line === undefined ? [] : [`  ${line}`])].join('\n');

/** The machine's fail of run n, `late`, naming the red checks; the next session reads them as after any fail. */
export function lateVerdictOf(review: LateReview): Result<Verdict, LateVerdictError> {
  const red = review.checks.filter(({ check }) => !check.pass);
  if (red.length === 0) return err({ code: 'no_red_check' });
  const parsed = VerdictSchema.safeParse({
    version: 1,
    id: lateVerdictIdOf(review.quest, review.n),
    quest_id: review.quest.id,
    attempt: review.n,
    verifier_id: MACHINE_VERIFIER,
    ritual: review.ritual,
    checks: red.map(({ check }) => check),
    result: 'fail',
    fail_kind: 'tests_fail',
    notes: red.map(noteOf).join('\n'),
    late: true,
    by_human: false,
    created_at: review.at,
  });
  return parsed.success ? ok(parsed.data) : err({ code: 'invalid_verdict' });
}

/**
 * The judge who shares a late fail (ADR 0033, owner's C6): the character whose pass of the run it overturns. The
 * machine and the owner take nothing, and nobody does when the run's verdict was no pass.
 */
export const overturnedJudgeOf = (pass: Pick<Verdict, 'verifier_id' | 'result'>): CharacterId | undefined =>
  pass.result === 'pass' && pass.verifier_id !== MACHINE_VERIFIER && pass.verifier_id !== USER_VERIFIER
    ? // verifier_id is a character slug once it is neither word (VerdictSchema).
      (pass.verifier_id as CharacterId)
    : undefined;
