// The quest's plot put back to its commit after commands that may write there (implementation-plan §3.1 "(P1-44)",
// ADR 0008): the judge's outside a scratch plot (P1-44, (f) of P1-37), and the machine checks before the judge
// opens (P1-47, (b) of P1-44). The quest's work was all committed before its review, so whatever changed since is a
// command's output (a generator rewrote 166 lines of the contract in the P1-37 run): the next session, a returned
// assignee's or the judge's, never takes it for work, nor commits it. A `plot.restored` line in the quest's journal
// says what went; it carries the judge's session when a judge left it, none after the checks.
import type { Quest } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

/** How many of the dropped paths the warning names; the line in the journal has them all. */
const PATHS_SHOWN = 3;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `a, b, c and 2 more`. */
function listed(paths: readonly string[]): string {
  const shown = paths.slice(0, PATHS_SHOWN).join(', ');
  return paths.length > PATHS_SHOWN ? `${shown} and ${String(paths.length - PATHS_SHOWN)} more` : shown;
}

/** Whose commands ran in the plot: the judge's session (`session`, when known), or the machine checks. */
export type RestoredAfter = { readonly by: 'judge'; readonly session?: string } | { readonly by: 'checks' };

const WHOSE = { judge: "the judge's commands", checks: "the checks' commands" } as const;
const AFTER = { judge: 'its judge', checks: 'its checks' } as const;

/**
 * The quest's own plot back to its commit, what changed or is untracked dropped (ignored files stay). A plot git
 * cannot put back costs a warning: it stays as the commands left it.
 */
export async function restorePlot(ctx: Context, quest: Quest, after: RestoredAfter): Promise<void> {
  let paths: readonly string[];
  try {
    paths = await ctx.deps.plots.restore(quest.plot);
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${quest.id}: the plot was not put back after ${AFTER[after.by]}: ${messageOf(error)}`,
    );
    return;
  }
  if (paths.length === 0) return;
  ctx.deps.log.warn(
    `steward: ${quest.id}: ${WHOSE[after.by]} left ${String(paths.length)} path(s) changed in the plot (${listed(paths)}); they were dropped`,
  );
  const session = after.by === 'judge' ? after.session : undefined;
  await ctx.record.note({
    type: 'plot.restored',
    actor: STEWARD,
    data: { paths: [...paths] },
    quest,
    session,
  });
}
