// "What you touch decides what runs", as data (implementation-plan §2.3, §3.2): a territory check runs when one of
// its `when` globs matches one of the paths the quest touched. A party changes that (§3.13 step 5, §3.15; P1-18): its
// merge quest runs every check, whatever it touched, and its parts leave the checks marked `defer_to_merge` (heavy
// integration and e2e) to it. The blind trial's acceptance part (§3.15, P1-21) runs none: its tests cannot pass before
// the parts are merged, and the merge quest runs them with every other check.
import type { PartyRole, TerritoryCheck } from '@elvaria/domain';

import { globToRegExp } from './glob.ts';

/** `./src\a.ts` → `src/a.ts`: globs are written relative to the plot, with `/`. */
const portableOf = (touched: string): string => touched.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');

/**
 * The checks to run, in the territory's order; none when nothing the quest touched is watched. `role` is the quest's
 * `party_role`: `merge` runs them all, `part` defers what the merge quest will run, `acceptance` defers them all.
 */
export function selectChecks(
  checks: readonly TerritoryCheck[],
  touched: readonly string[],
  role?: PartyRole,
): TerritoryCheck[] {
  if (role === 'merge') return [...checks];
  if (role === 'acceptance') return [];
  const paths = touched.map(portableOf);
  return checks.filter(
    (check) =>
      !(role === 'part' && check.defer_to_merge) &&
      check.when.some((glob) => {
        const pattern = globToRegExp(glob);
        return paths.some((touchedPath) => pattern.test(touchedPath));
      }),
  );
}
