// The Steward's commits in a quest's plot (implementation-plan §3.3): `chore: submit <quest>` before review, `chore:
// wip <quest> (<reason>)` after a breaker or a pause for mana. Always with the territory's hooks (never
// `--no-verify`): a refusal leaves the work in the plot, and the caller says so. Never a path of the territory's
// laws.forbidden_paths (P1-49, (b) of P1-46): the fence stops a session's tools, not a program its shell runs, which
// may write there (`node write-secret.mjs`, spike Antigravity §15); the plot's changes are read first, and one such
// path leaves everything uncommitted. The same read names the paths of laws.protected_paths the work changed (PS-04,
// ADR 0026): never a refusal, the submit marks the quest for the royal seal and the stronger judge instead.
import { currentRun, protectedPathsOf, runDirOf } from '@elvaria/domain';
import { redact } from '@elvaria/eventlog';
import { forbiddenChangesOf, forbiddenPathsOf, hookOutputHead } from '@elvaria/runner-core';
import { inKingdom, writeFileAtomic } from '@elvaria/store';
import type { Quest, QuestId } from '@elvaria/domain';
import type { CommitOutcome } from '@elvaria/runner-core';

import { pathsSaid } from '../infirmary.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * What the Steward's commit did: git's outcome, with the protected paths the plot's changes touch when there are any
 * (PS-04), or nothing committed for the forbidden paths the plot changed.
 */
export type PlotCommit =
  | (CommitOutcome & { readonly protected_changes?: readonly string[] })
  | { readonly status: 'forbidden'; readonly paths: readonly string[] };

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
 * The protected paths a quest's plot changed since it forked, for a submit no commitPlot comes before: the machine's
 * merge of a party's parts (PS-04). None when git cannot say (logged): a merge quest waits for the seal all the same.
 */
export async function protectedChangesIn(ctx: Context, quest: Quest): Promise<string[]> {
  const globs = protectedPathsOf(ctx.world.territories.get(quest.territory));
  if (globs.length === 0) return [];
  try {
    return forbiddenChangesOf(await ctx.deps.plots.touched(quest.plot), globs);
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${quest.id}: the protected paths its work changed are unknown: ${messageOf(error)}`,
    );
    return [];
  }
}

/**
 * `git add --all` + commit in the quest's plot; a failing git is a refusal too, never a bypass. A plot whose
 * changes git cannot list is refused as well: the fence cannot be checked, so nothing is committed. Every Steward
 * commit comes with the run's folder in `.runs/` (P1-55): scratch files at the plot's root that a character cannot
 * delete go there instead of into the commit, and the work a hook refuses is kept there as a patch.
 */
export async function commitPlot(ctx: Context, questId: QuestId, message: string): Promise<PlotCommit> {
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return { status: 'no_git' };
  try {
    const territory = ctx.world.territories.get(quest.territory);
    const changed = await ctx.deps.plots.touched(quest.plot);
    const paths = forbiddenChangesOf(changed, forbiddenPathsOf(territory));
    if (paths.length > 0) return { status: 'forbidden', paths };
    // Matched as the forbidden paths are, at any depth: a seal asked for in error costs the owner one look.
    const guarded = forbiddenChangesOf(changed, protectedPathsOf(territory));
    const dir = inKingdom(ctx.root, runDirOf(quest, currentRun(quest), 'assignee'));
    const outcome = await ctx.deps.plots.commit(quest.plot, message, { dir });
    const aside = 'set_aside' in outcome ? (outcome.set_aside ?? []) : [];
    if (aside.length > 0)
      ctx.deps.log.warn(
        `steward: ${questId}: left out of the commit and set aside in ${dir}: ${aside.join(', ')}`,
      );
    return guarded.length === 0 ? outcome : { ...outcome, protected_changes: guarded };
  } catch (error) {
    const output = redact(messageOf(error), []);
    const head = hookOutputHead(output);
    const log = 'pre-commit.log';
    const dir = runDirOf(quest, currentRun(quest), 'assignee');
    try {
      await writeFileAtomic(inKingdom(ctx.root, `${dir}/${log}`), output);
    } catch (failure) {
      ctx.deps.log.warn(`steward: ${questId}: commit log could not be written: ${messageOf(failure)}`);
    }
    return { status: 'refused', detail: head.lines.join('\n'), head, log };
  }
}
