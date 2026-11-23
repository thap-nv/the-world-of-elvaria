// The check mode of one run of a quest's checks (CM-01, ADR 0032, plans/check-modes.md "Ba chế độ, bốn lượt kiểm").
// A run is the one after a session, before its judge, or the merge queue's after merging the base branch in. In a
// territory whose check_policy is `narrow` (or `deferred`, which has no train before CM-08) both take the checks
// `when` selects and run each one's narrow command where it has one: the part of the tree the quest did not touch is
// its base's, which the base branch's full run vouches for. What that cannot vouch for runs as in `full`: a path of
// full_when (the build's own configuration), a path no check watches, a party's merge quest (every check, P1-18) and
// a quest judged in a scratch plot, whose judge breaks the tests on purpose (ADR 0022). The choice is pure, so the
// Steward's run, its `check.*` lines and its judge's shell all read the same one.
import { checkPolicyOf } from '@elvaria/domain';
import type { CommandLines, PartyRole, Territory, TerritoryCheck } from '@elvaria/domain';

import { globToRegExp } from './glob.ts';
import { portableOf } from './select-checks.ts';

/** The env variable a check command reads the commit its diff counts from in (C5 of check-modes, never in argv). */
export const CHECK_BASE_ENV = 'ELVARIA_CHECK_BASE';

/** A run of the machine checks: after a session, before its judge, or the merge queue's before a delivery (PS-09). */
export type CheckPass = 'session' | 'queue';

/** `narrow`: each check runs its narrow command where it has one; `full`: its `run`, as before CM-01. */
export type CheckRunMode = 'full' | 'narrow';

export interface CheckRunOf {
  readonly pass: CheckPass;
  /** The quest's `party_role`: a merge quest runs every check, in every mode. */
  readonly role?: PartyRole | undefined;
  /** The quest's ritual judges it in a scratch plot (ADR 0022): its checks run whole, in every mode. */
  readonly scratch?: boolean;
}

const watchedBy = (globs: readonly string[], touched: string): boolean =>
  globs.some((glob) => globToRegExp(glob).test(touched));

/** Whether some path the run's quest touched forces the full run: one of full_when, or one no check watches. */
function forcesFull(
  territory: Pick<Territory, 'checks'>,
  fullWhen: readonly string[],
  touched: readonly string[],
) {
  return touched
    .map(portableOf)
    .some(
      (path) => watchedBy(fullWhen, path) || !territory.checks.some((check) => watchedBy(check.when, path)),
    );
}

/** How the run `run` of a quest that touched `touched` runs its checks on `territory`. */
export function checkModeOf(
  territory: Pick<Territory, 'checks' | 'check_policy'>,
  touched: readonly string[],
  run: CheckRunOf,
): CheckRunMode {
  const policy = checkPolicyOf(territory);
  if (policy.mode === 'full' || run.role === 'merge' || run.scratch === true) return 'full';
  // Until the train of CM-08, the queue is the last run before the base branch: in `deferred` it runs every check.
  if (policy.mode === 'deferred' && run.pass === 'queue') return 'full';
  return forcesFull(territory, policy.full_when, touched) ? 'full' : 'narrow';
}

/** The command(s) `check` runs in a run of `mode`. */
export const checkLinesOf = (check: TerritoryCheck, mode: CheckRunMode): CommandLines =>
  mode === 'narrow' ? (check.narrow ?? check.run) : check.run;
