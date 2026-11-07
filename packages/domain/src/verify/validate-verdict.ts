// validateVerdict(verdict, quest, rule): the checks of a verdict that need the quest (implementation-plan §3.2,
// §3.12, ADR 0008); the verdict schema checks the rest. The Steward writes no verdict that fails them: the doer
// never judges (party members included, ADR 0020), a character judges only in a verifier session the Steward
// spawned (never a sub-agent of the worker), and a failing check never lets the quest pass.
import { err, ok } from '../core/result.ts';
import { MACHINE_VERIFIER, USER_VERIFIER } from '../schema/quest/verdict.ts';
import { pastAssigneesOf } from './past-assignees-of.ts';
import type { CheckId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { PassRule } from './pass-rule.ts';

export type VerdictIssue =
  | { readonly code: 'other_quest' }
  | { readonly code: 'verifier_worked' }
  | { readonly code: 'unknown_session' }
  | { readonly code: 'pass_with_failing_check'; readonly checks: readonly CheckId[] };

/** Pass rules under which a failing check fails the quest. */
const CHECKS_DECIDE: readonly PassRule[] = ['all_checks_and_agent', 'checks_only'];

/** A verifier attempt of this run, by this verifier, in this session: the Steward spawned it. */
const spawnedFor = (quest: Quest, verdict: Verdict): boolean =>
  quest.attempt_log.some(
    (entry) =>
      entry.role === 'verifier' &&
      entry.n === verdict.attempt &&
      entry.character === verdict.verifier_id &&
      entry.session_id !== undefined &&
      entry.session_id === verdict.session_id,
  );

/** `party`: the other quests of the quest's party (partyOf), whose past assignees never judge it either. */
export function validateVerdict(
  verdict: Verdict,
  quest: Quest,
  rule: PassRule,
  party: readonly Quest[] = [],
): Result<Verdict, VerdictIssue> {
  if (verdict.quest_id !== quest.id) return err({ code: 'other_quest' });
  // verifier_id is a plain slug (`user` and `machine` judge too); past assignees are characters.
  const pastAssignees = new Set<string>(pastAssigneesOf(quest, party));
  if (pastAssignees.has(verdict.verifier_id)) return err({ code: 'verifier_worked' });
  const character = verdict.verifier_id !== USER_VERIFIER && verdict.verifier_id !== MACHINE_VERIFIER;
  if (character && !spawnedFor(quest, verdict)) return err({ code: 'unknown_session' });
  const failing = verdict.checks.filter(({ pass }) => !pass).map(({ id }) => id);
  if (verdict.result === 'pass' && failing.length > 0 && CHECKS_DECIDE.includes(rule))
    return err({ code: 'pass_with_failing_check', checks: failing });
  return ok(verdict);
}
