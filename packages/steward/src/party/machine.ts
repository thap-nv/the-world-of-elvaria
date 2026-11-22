// The machine's run of a party's merge quest (implementation-plan §2.5, §3.13; P1-18 proposal (h)): when every part
// merges cleanly a knight's session would change nothing, so the Steward makes the first run itself, as it runs a
// script: claimed with no assignee, the plot prepared on the contract's branch and started, the parts merged in, then
// the territory's base branch (PS-08e), then submitted to the checks (every one of the territory, and `party`) and to
// a judge from outside the party; parts that changed a protected path make it ask for the stronger judge, as a
// knight's submit would (PS-04), what the base branch changed on its own never does. A merge that stops (a conflict
// with a part or the base branch, a hook) is released instead, the merge left in progress in the plot: a knight takes
// the next run, as it does after a judge fails the machine's (`review.verdict_fail.machine_retry`). It merges as the
// merge before a knight's session does (mergeParts, fix/merge-quest-followups (m)): by the rules of the territory's
// shared_paths, the generators run once a `regenerate` rule kept a side, so a hot file never calls a knight alone.
import { err, ok, protectedMarkOf } from '@elvaria/domain';
import type { Quest, QuestId, Result } from '@elvaria/domain';

import { moveAndRing } from '../bell/move-and-ring.ts';
import { protectedChangesIn } from '../sessions/commit.ts';
import { questSecretsOf } from '../sessions/secrets.ts';
import { mergeParts, plotOptionsOf } from './plot.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface MachinePlot {
  readonly plot: Quest['plot'];
  /** The quest's secrets, for setup and the generators as a session's get them; absent when it has none. */
  readonly secrets?: Readonly<Record<string, string>>;
}

/** The plot of the run, with the quest's secrets for setup as a session's; the claim given back when it fails. */
async function plotOf(ctx: Context, quest: Quest): Promise<Result<MachinePlot, string>> {
  const territory = ctx.world.territories.get(quest.territory);
  if (territory === undefined) return err('unknown_territory');
  try {
    const secrets = await questSecretsOf(ctx, quest, territory);
    const given = Object.keys(secrets).length === 0 ? undefined : secrets;
    const prepared = await ctx.deps.plots.prepare(quest, territory, plotOptionsOf(ctx, quest, given));
    return ok(given === undefined ? { plot: prepared.plot } : { plot: prepared.plot, secrets: given });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no plot to merge the parts in: ${messageOf(error)}`);
    await moveAndRing(ctx, { quest: quest.id, event: { type: 'release' }, actor: 'steward' });
    return err('plot_failed');
  }
}

/**
 * The run's merge, then setup and the generators on its result (mergeParts); a setup that fails once the base branch
 * is in throws, and the run stops there as on a conflict: the knight's session prepares the plot again, and says why.
 */
async function mergeOf(
  ctx: Context,
  quest: Quest,
  { plot, secrets }: MachinePlot,
): Promise<string | undefined> {
  try {
    return (await mergeParts(ctx, quest, plot, secrets))?.stop?.reason;
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the machine's merge failed: ${messageOf(error)}`);
    return 'failed';
  }
}

/** Merges the parts of merge quest `id` itself and submits the run, or releases it to a knight when the merge stops. */
export async function mergeByMachine(ctx: Context, id: QuestId): Promise<Result<Quest, string>> {
  const claim = { type: 'claim', assignee: null } as const;
  const claimed = await moveAndRing(ctx, { quest: id, event: claim, actor: 'steward' });
  if (!claimed.ok) return claimed;
  const prepared = await plotOf(ctx, claimed.value);
  if (!prepared.ok) return prepared;
  const started = await moveAndRing(ctx, {
    quest: id,
    event: { type: 'start' },
    actor: 'steward',
    before: { plot: prepared.value.plot },
  });
  if (!started.ok) return started;
  // The parts, then the base branch (PS-08e): the checks and the judge see the party against main as it is now.
  const stopped = await mergeOf(ctx, started.value, prepared.value);
  if (stopped === undefined) {
    const mark = protectedMarkOf(started.value, await protectedChangesIn(ctx, started.value));
    const before = mark === undefined ? {} : { before: mark };
    return moveAndRing(ctx, { quest: id, event: { type: 'submit' }, actor: 'steward', ...before });
  }
  // mergeParts said where the merge stopped, and on which files, on the line before.
  ctx.deps.log.warn(`steward: ${id}: the machine's run stopped (${stopped}); a knight takes the quest`);
  return moveAndRing(ctx, { quest: id, event: { type: 'release' }, actor: 'steward' });
}
