// The verdict the Steward issues when the machine judges alone (implementation-plan §3.2, ADR 0008): with
// dispatch.verifier_same_family = machine_only and no judge of another family in the kingdom. The checks decide
// (checks_only); `verifier_id: machine`, no session, notes written from the checks. Never a pass with a failing check.
import { err, ok } from '../core/result.ts';
import { MACHINE_VERIFIER, VerdictSchema } from '../schema/quest/verdict.ts';
import { underPassRule } from './pass-rule.ts';
import { verdictIdOf } from './verdict-id.ts';
import type { RitualId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict, VerdictCheck } from '../schema/quest/verdict.ts';

export interface MachineReview {
  readonly quest: Pick<Quest, 'id'>;
  /** The run it judges. */
  readonly n: number;
  /** The ritual of the quest's kind. */
  readonly ritual: RitualId;
  readonly checks: readonly VerdictCheck[];
  /** ISO 8601 in kingdom.tz. */
  readonly at: string;
}

/** The checks that passed; underPassRule puts the failing ones before them. */
const passedNote = (checks: readonly VerdictCheck[]): string =>
  checks
    .filter(({ pass }) => pass)
    .map(({ id, log_path: log }) => `✓ ${id}: ${log}`)
    .join('\n');

/** `invalid_verdict` only when the inputs break the verdict schema (a run below 1, a time without offset). */
export function machineVerdictOf(
  review: MachineReview,
): Result<Verdict, { readonly code: 'invalid_verdict' }> {
  const parsed = VerdictSchema.safeParse({
    version: 1,
    id: verdictIdOf(review.quest, review.n),
    quest_id: review.quest.id,
    attempt: review.n,
    verifier_id: MACHINE_VERIFIER,
    ritual: review.ritual,
    checks: review.checks,
    result: 'pass',
    ...(review.checks.some(({ pass }) => pass) ? { notes: passedNote(review.checks) } : {}),
    by_human: false,
    created_at: review.at,
  });
  if (!parsed.success) return err({ code: 'invalid_verdict' });
  return ok(underPassRule(parsed.data, 'checks_only'));
}
