// After a contract quest's delivery opened its parts (implementation-plan §3.13 step 3, P1-18): its sub-quest list has
// done its work, and every branch of the party starts from the contract's, the merge quest's included, which the
// owner merges into the main branch. So the Steward removes subquests.json from the contract branch in a commit of
// its own, before any part's worktree is made from it. A failure costs a warning line: the file then rides along
// to the merge quest's branch, where the owner sees it in the diff.
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { SUBQUESTS_FILE, plotCommitMessage } from '@elvaria/runner-core';
import type { Quest } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Removes the delivered contract's list from its branch; nothing for a plot without git. */
export async function closeContract(ctx: Context, contract: Quest): Promise<void> {
  const plot = contract.plot;
  if (plot.type !== 'worktree' || plot.path === undefined) return;
  try {
    await rm(path.join(fromPortable(plot.path), SUBQUESTS_FILE));
    const committed = await ctx.deps.plots.commit(
      plot,
      plotCommitMessage.partsOpen(contract.id, SUBQUESTS_FILE),
    );
    if (committed.status === 'refused')
      ctx.deps.log.warn(
        `steward: ${contract.id}: ${SUBQUESTS_FILE} stays on its branch: ${committed.detail}`,
      );
  } catch (error) {
    ctx.deps.log.warn(`steward: ${contract.id}: ${SUBQUESTS_FILE} stays on its branch: ${messageOf(error)}`);
  }
}
