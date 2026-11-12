// "What you touch decides what runs", as data (implementation-plan §2.3, §3.2): a territory check runs when one of
// its `when` globs matches one of the paths the quest touched. A party changes that (§3.13 step 5, §3.15; P1-18): its
// merge quest runs every check, whatever it touched, and its parts leave the checks marked `defer_to_merge` (heavy
// integration and e2e) to it. The blind trial's acceptance part (§3.15, P1-21) runs none: its tests cannot pass before
// the parts are merged, and the merge quest runs them with every other check. The contract quest defers them too
// (P1-37, owner's choice): it holds an interface written before the code, so a check comparing generated files with
// the code (dc1's `openapi_drift`) cannot pass there, and a 13-minute e2e tests nothing it changed.
import type { PartyRole, TerritoryCheck } from '@elvaria/domain';

import { globToRegExp } from './glob.ts';

/** `./src\a.ts` → `src/a.ts`: globs are written relative to the plot, with `/`. */
export const portableOf = (touched: string): string =>
  touched.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');

/** Whether the quest's `party_role` leaves `check` to the party's merge quest, whatever the quest touched. */
const deferredFor = (check: TerritoryCheck, role: PartyRole | undefined): boolean =>
  role === 'acceptance' || ((role === 'part' || role === 'contract') && check.defer_to_merge);

/**
 * The checks to run, in the territory's order; none when nothing the quest touched is watched. `role` is the quest's
 * `party_role`: `merge` runs them all, `part` and `contract` defer what the merge quest will run, `acceptance` defers
 * them all.
 */
export function selectChecks(
  checks: readonly TerritoryCheck[],
  touched: readonly string[],
  role?: PartyRole,
): TerritoryCheck[] {
  if (role === 'merge') return [...checks];
  const paths = touched.map(portableOf);
  return checks.filter(
    (check) =>
      !deferredFor(check, role) &&
      check.when.some((glob) => {
        const pattern = globToRegExp(glob);
        return paths.some((touchedPath) => pattern.test(touchedPath));
      }),
  );
}

/**
 * The checks selectChecks never picks for a quest of `role`, whatever it touches (P1-43): what a part's or a contract
 * quest's prompt names as left to the merge quest, so its session does not work for a check that will not run.
 */
export const deferredChecks = (checks: readonly TerritoryCheck[], role?: PartyRole): TerritoryCheck[] =>
  checks.filter((check) => deferredFor(check, role));
