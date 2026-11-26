// The merge queue's run of the checks on its updated branch (RC-04, ADR 0035, plans/recheck.md §2.2). The check
// ledger first: a check green with the same command on this very tree is carried, not run, so a delivery given again
// after a red run on the same merge runs only the checks that were red. Each `check.end` names the tree, the config
// and a narrow run's base, the facts the next run carries. (K5) Red, not for its environment, on a tree git names:
// the red checks run once more on the same tree in the same run (the ledger now carries the green ones), before the
// queue asks the base branch (PS-09d) or the quest's own head (CM-06). Green then: `check.attributed` from the queue,
// cause `flaky`, and the delivery goes on with that second run. Red again, or a run that cannot say: the first run, as
// before. The run after a session never runs again: there a red is most often the assignee's own.
import { environmentFailureOf, queueFlakyOf } from '@elvaria/domain';
import type { PartyRole, QuestId } from '@elvaria/domain';
import type { CheckPoint, CheckRun } from '@elvaria/runner-core';

import { carriedFor, checkPointOf, factsOf, ranEndOf } from '../check-ledger/carry.ts';
import { deliveryNote, messageOf, stopped } from './delivery.ts';
import type { Context } from '../context.ts';
import type { Delivery } from './delivery.ts';

/** Portable, relative to the kingdom: the delivery's run folder, whose `checks/` holds the queue's check logs. */
const deliveryRunOf = (quest: QuestId): string => `.runs/${quest}-delivery`;

/** How the queue runs the checks: the quest's secrets, the check mode's mark, the role that selects them. */
export interface QueueRun {
  readonly secrets: Readonly<Record<string, string>>;
  readonly mode: { readonly mode?: 'narrow' };
  readonly role: { readonly party_role?: PartyRole };
}

/** What `check.end` says of the queue's checks: what each gave, or that they could not run or were stopped. */
function endOf(runs: readonly CheckRun[] | undefined, signal: AbortSignal) {
  if (signal.aborted) return { delivery: true, outcome: 'stopped', checks: [] };
  if (runs === undefined) return { delivery: true, outcome: 'error', checks: [] };
  return { delivery: true, ...ranEndOf(runs, environmentFailureOf(runs)) };
}

/** One run: `check.start`, the checks the ledger does not carry, `check.end` naming the point they ran on. */
async function runOnce(ctx: Context, d: Delivery, run: QueueRun, point: CheckPoint | undefined) {
  const carried = await carriedFor(ctx, d.territory, point);
  await deliveryNote(ctx, d, { type: 'check.start', data: { delivery: true, ...run.mode } });
  let runs: readonly CheckRun[] | undefined;
  try {
    runs = await ctx.deps.plots.check({
      plot: d.quest.plot,
      territory: d.territory,
      run_dir: deliveryRunOf(d.quest.id),
      signal: d.signal,
      secrets: run.secrets,
      ...run.role,
      ...run.mode,
      ...(carried.length === 0 ? {} : { carried }),
    });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${d.quest.id}: the checks of its update did not run: ${messageOf(error)}`);
  }
  const facts = runs === undefined ? {} : factsOf(d.territory, point);
  await deliveryNote(ctx, d, {
    type: 'check.end',
    data: { ...endOf(runs, d.signal), ...run.mode, ...facts },
  });
  return runs;
}

/** True once the second run proved every red check of the first `flaky`, its `check.attributed` written. */
async function flakyAfter(ctx: Context, d: Delivery, red: readonly string[], again: readonly CheckRun[]) {
  const commit = await ctx.deps.plots.head(d.quest.plot);
  if (commit === null) return false;
  const environment = environmentFailureOf(again);
  const data = queueFlakyOf({
    territory: d.territory.id,
    checks: red,
    run: {
      commit,
      red: environment === undefined ? again.some(({ pass }) => !pass) : undefined,
      duration_ms: again.reduce((sum, { duration_ms: ms }) => sum + ms, 0),
    },
  });
  if (data === undefined) return false;
  await deliveryNote(ctx, d, { type: 'check.attributed', data: { ...data } });
  return true;
}

/** The queue's checks, run once more where only red; undefined when they could not run or the Steward stopped. */
export async function queueChecksOf(
  ctx: Context,
  d: Delivery,
  run: QueueRun,
): Promise<readonly CheckRun[] | undefined> {
  const point = await checkPointOf(ctx, d.quest, run.mode.mode);
  const first = await runOnce(ctx, d, run, point);
  if (first === undefined || stopped(d) || point?.tree === undefined) return first;
  const red = first.filter(({ pass }) => !pass).map(({ id }) => id);
  if (red.length === 0 || environmentFailureOf(first) !== undefined) return first;
  const again = await runOnce(ctx, d, run, point);
  if (again === undefined || stopped(d)) return first;
  return (await flakyAfter(ctx, d, red, again)) ? again : first;
}
