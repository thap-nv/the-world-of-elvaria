// The fingerprint of a territory's check commands (RC-03, ADR 0035, plans/recheck.md §2.1): `config` on `check.end`
// and `patrol.ran`. A green check is carried only under the same one, so an owner's edit of commands.setup or of a
// check's id, `run` or `narrow` expires every earlier green of the territory. `when`, `full_when`, the mode and the
// timeouts stay out: they change which checks run, not what a green one means. A command written as one line or as a
// list of that one line is the same command; the territory's order of its checks is no part of it.
import { createHash } from 'node:crypto';

import { CHECK_CONFIG_LENGTH, commandLinesOf } from '@elvaria/domain';
import type { Territory } from '@elvaria/domain';

/** sha256 of the commands that give a green check its meaning, cut to CHECK_CONFIG_LENGTH hex digits. */
export function checkConfigOf(territory: Pick<Territory, 'checks' | 'commands'>): string {
  const checks = territory.checks
    .map(({ id, run, narrow }) => ({
      id,
      run: commandLinesOf(run),
      narrow: narrow === undefined ? null : commandLinesOf(narrow),
    }))
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
  const print = JSON.stringify({ setup: territory.commands.setup ?? null, checks });
  return createHash('sha256').update(print).digest('hex').slice(0, CHECK_CONFIG_LENGTH);
}

/**
 * (RC-04, ADR 0035) What a run of the checks is a fact about, told before they run so the Steward can carry: the tree
 * (absent with uncommitted changes or no git, then the run is no fact) and, for a narrow run, its diff's base.
 */
export interface CheckPoint {
  readonly tree?: string;
  readonly base?: string;
}
