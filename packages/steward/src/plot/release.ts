// A quest gives its plot back (§2.5 `done.archive`; P2-01d): the worktree goes, its branch stays. At archive for every
// quest, and once delivered for a read-only one, whose branch goes nowhere (forgeDue). Moved out of
// inbox/quest-commands.ts so delivery and archive share it without one reaching into the other.
import type { Quest } from '@elvaria/domain';

import { releaseScratch } from '../review/scratch.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The quest's plot, given back. A worktree with uncommitted work is refused and stays for the owner (no `--force`,
 * §3.3); a worktree given back already is no worktree to remove, so a second call only clears what is left.
 */
export async function releasePlot(ctx: Context, quest: Quest): Promise<void> {
  // A judge's scratch plot that a stopped Steward left behind goes with the quest's own (ADR 0022, P1-20).
  await releaseScratch(ctx, quest.id);
  try {
    const released = await ctx.deps.plots.release(quest.plot);
    if (!released.ok) {
      const { reason, detail } = released.error;
      ctx.deps.log.warn(`steward: ${quest.id}: the plot stays (${reason}): ${detail}`);
      return;
    }
    for (const failure of released.value.forget_failures)
      ctx.deps.log.warn(`steward: ${quest.id}: a tribe's CLI kept data about the plot: ${failure}`);
    // Git and the tribes are done with the plot; only the folder stays, for the owner (P1-11).
    const { leftover } = released.value;
    if (leftover !== undefined)
      ctx.deps.log.warn(`steward: ${quest.id}: the plot's folder stays, remove it by hand: ${leftover}`);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the plot stays: ${messageOf(error)}`);
  }
}
