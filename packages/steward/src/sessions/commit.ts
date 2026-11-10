// The Steward's commits in a quest's plot (implementation-plan §3.3): `chore: submit <quest>` before review, `chore:
// wip <quest> (<reason>)` after a breaker or a pause for mana. Always with the territory's hooks (never
// `--no-verify`): a refusal leaves the work in the plot, and the caller says so. Never a path of the territory's
// laws.forbidden_paths (P1-49, (b) of P1-46): the fence stops a session's tools, not a program its shell runs, which
// may write there (`node write-secret.mjs`, spike Antigravity §15); the plot's changes are read first, and one such
// path leaves everything uncommitted.
import { forbiddenChangesOf, forbiddenPathsOf } from '@elvaria/runner-core';
import type { QuestId } from '@elvaria/domain';
import type { CommitOutcome } from '@elvaria/runner-core';

import { pathsSaid } from '../infirmary.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What the Steward's commit did: git's outcome, or nothing committed for the forbidden paths the plot changed. */
export type PlotCommit = CommitOutcome | { readonly status: 'forbidden'; readonly paths: readonly string[] };

/** Why a WIP commit was not made: the forbidden paths, for the infirmary's `wip` detail. */
export const forbiddenWip = (paths: readonly string[]): string =>
  `laws.forbidden_paths changed in the plot, so nothing was committed: ${pathsSaid(paths)}`;

/** What a WIP commit nobody else reports left behind (a pause for mana, a suspend): the log says it stays in the plot. */
export function warnUncommitted(ctx: Context, questId: QuestId, outcome: PlotCommit): void {
  const why =
    outcome.status === 'refused'
      ? outcome.detail
      : outcome.status === 'forbidden'
        ? forbiddenWip(outcome.paths)
        : undefined;
  if (why !== undefined)
    ctx.deps.log.warn(`steward: ${questId}: WIP not committed, it stays in the plot: ${why}`);
}

/**
 * `git add --all` + commit in the quest's plot; a failing git is a refusal too, never a bypass. A plot whose
 * changes git cannot list is refused as well: the fence cannot be checked, so nothing is committed.
 */
export async function commitPlot(ctx: Context, questId: QuestId, message: string): Promise<PlotCommit> {
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return { status: 'no_git' };
  try {
    const territory = ctx.world.territories.get(quest.territory);
    const changed = await ctx.deps.plots.touched(quest.plot);
    const paths = forbiddenChangesOf(changed, forbiddenPathsOf(territory));
    if (paths.length > 0) return { status: 'forbidden', paths };
    return await ctx.deps.plots.commit(quest.plot, message);
  } catch (error) {
    return { status: 'refused', detail: messageOf(error) };
  }
}
