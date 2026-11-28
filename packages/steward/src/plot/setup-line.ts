// The plot.setup line (LL-04, plans/learning-loop.md §4.3): commands.setup ran in a quest's plot, and how it ended, so
// the log shows a setup run again after a lockfile changed (fix/plot-setup-on-lockfile) instead of only its failure.
import type { Quest, Result } from '@elvaria/domain';
import { setupLogOf } from '@elvaria/runner-core';
import type { PlotFailure, SetupRun } from '@elvaria/runner-core';

import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';

const CHANGED = { trigger: 'changed' } as const;

/**
 * What Plots.refreshSetup did before a commit. Its trigger is always `changed`: prepare, before every session, ran
 * setup until it succeeded (else the quest went to the infirmary), so a setup due at the commit after it is one a file
 * of commands.setup_when changed for, or a plot set up before setup_when was written. Not due: no line; cut short by
 * the Steward's stop: no line either, the next prepare runs it again.
 */
export async function noteSetup(
  ctx: Context,
  quest: Quest,
  ran: Result<SetupRun | null, PlotFailure>,
): Promise<void> {
  if (ran.ok) {
    if (ran.value === null) return;
    const { duration_ms, log_path } = ran.value;
    await ctx.record.note({
      type: 'plot.setup',
      actor: STEWARD,
      data: { ...CHANGED, pass: true, duration_ms, log_path },
      quest,
    });
    return;
  }
  if (ctx.stopping.aborted) return;
  const data = {
    ...CHANGED,
    pass: false,
    log_path: ran.error.log_path ?? setupLogOf(quest.id),
    detail: ran.error.detail,
  };
  await ctx.record.note({ type: 'plot.setup', actor: STEWARD, data, quest });
}
