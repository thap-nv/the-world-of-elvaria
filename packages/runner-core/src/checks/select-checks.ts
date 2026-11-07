// "What you touch decides what runs", as data (implementation-plan §2.3, §3.2): a territory check runs when one of
// its `when` globs matches one of the paths the quest touched.
import type { TerritoryCheck } from '@elvaria/domain';

import { globToRegExp } from './glob.ts';

/** `./src\a.ts` → `src/a.ts`: globs are written relative to the plot, with `/`. */
const portableOf = (touched: string): string => touched.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');

/** The checks to run, in the territory's order; none when nothing the quest touched is watched. */
export function selectChecks(
  checks: readonly TerritoryCheck[],
  touched: readonly string[],
): TerritoryCheck[] {
  const paths = touched.map(portableOf);
  return checks.filter((check) =>
    check.when.some((glob) => {
      const pattern = globToRegExp(glob);
      return paths.some((touchedPath) => pattern.test(touchedPath));
    }),
  );
}
