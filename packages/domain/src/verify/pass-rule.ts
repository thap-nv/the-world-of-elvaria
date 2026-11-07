// The machine is the primary judge (implementation-plan §3.2, ADR 0008): the ritual's pass rule decides what a
// verdict says once the checks have run. all_checks_and_agent: a failing check fails the quest whatever the judge
// said. checks_only: the checks alone decide. agent_only: the judge's word stands. A partial verdict stays partial,
// since the next judge reads on from it. A failing check gives the overruled pass its kind (P1-15): `tests_fail`, or
// `incomplete` for the Steward's check of a plan's sub-quest list.
import type { CheckId } from '../core/ids.ts';
import type { FailKind } from '../schema/common.ts';
import type { Ritual } from '../schema/registry-entries.ts';
import type { Verdict, VerdictCheck } from '../schema/quest/verdict.ts';

export type PassRule = Ritual['pass_rule'];

/**
 * The failing checks, one per line with the log that says why: identifiers and paths only, so the note reads the
 * same in every owner's language (the verdict's notes are written in kingdom.owner.locale).
 */
export const failedChecksNote = (checks: readonly VerdictCheck[]): string =>
  checks
    .filter(({ pass }) => !pass)
    .map(({ id, log_path: log }) => `✗ ${id}: ${log}`)
    .join('\n');

/**
 * The check the Steward runs on a plan's `subquests.json` before its judge (P1-15, implementation-plan §3.2): what
 * the delivery would open. The literal matches the CheckId pattern by construction.
 */
export const SUBQUESTS_CHECK_ID = 'subquests' as CheckId;

/**
 * What a failing check says about the work (P1-15): a sub-quest list the Steward would refuse is unfinished work,
 * not a failing test. Every other check, the territory's own, fails as `tests_fail`.
 */
const CHECK_FAIL_KINDS: Readonly<Partial<Record<string, FailKind>>> = { [SUBQUESTS_CHECK_ID]: 'incomplete' };

/**
 * A pass the checks overrule: the failing checks first, then whatever the judge wrote. Its kind is the first
 * failing check's, the one the notes name first.
 */
const overruled = (verdict: Verdict, first: VerdictCheck): Verdict => {
  const notes = [failedChecksNote(verdict.checks), verdict.notes ?? ''].filter((part) => part !== '');
  const failKind = CHECK_FAIL_KINDS[first.id] ?? 'tests_fail';
  return { ...verdict, result: 'fail', fail_kind: failKind, notes: notes.join('\n\n') };
};

export function underPassRule(verdict: Verdict, rule: PassRule): Verdict {
  if (verdict.result === 'partial' || rule === 'agent_only') return verdict;
  const failing = verdict.checks.find(({ pass }) => !pass);
  if (rule === 'checks_only' && failing === undefined) {
    const { fail_kind: _dropped, ...passed } = verdict;
    return { ...passed, result: 'pass' };
  }
  if (failing === undefined || verdict.result === 'fail') return verdict;
  return overruled(verdict, failing);
}
