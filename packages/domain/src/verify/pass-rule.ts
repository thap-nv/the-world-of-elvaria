// The machine is the primary judge (implementation-plan §3.2, ADR 0008): the ritual's pass rule decides what a
// verdict says once the checks have run. all_checks_and_agent: a failing check fails the quest whatever the judge
// said. checks_only: the checks alone decide. agent_only: the judge's word stands. A partial verdict stays partial,
// since the next judge reads on from it.
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

/** A pass the checks overrule: the failing checks first, then whatever the judge wrote. */
const overruled = (verdict: Verdict): Verdict => {
  const notes = [failedChecksNote(verdict.checks), verdict.notes ?? ''].filter((part) => part !== '');
  return { ...verdict, result: 'fail', fail_kind: 'tests_fail', notes: notes.join('\n\n') };
};

export function underPassRule(verdict: Verdict, rule: PassRule): Verdict {
  if (verdict.result === 'partial' || rule === 'agent_only') return verdict;
  const failing = verdict.checks.some(({ pass }) => !pass);
  if (rule === 'checks_only' && !failing) {
    const { fail_kind: _dropped, ...passed } = verdict;
    return { ...passed, result: 'pass' };
  }
  if (!failing || verdict.result === 'fail') return verdict;
  return overruled(verdict);
}
