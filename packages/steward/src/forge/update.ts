// The merge queue's update of a done quest's branch before its delivery (implementation-plan §3.16.7, ADR 0023;
// PS-09), from deliverFound before the secret scan. In order: the base branch where a new quest would start (fetched)
// merged in, never rebased, the conflicts of hot files resolved by their rule (runner-core's base-update.ts); nothing
// more when the branch held it already, since the judge's checks ran on this very commit. Then commands.setup again,
// the generators (their commit apart), one `plot.merged` line naming what the rules resolved and what a generator was
// not to change, and every check of the territory on the new head, as a merge quest runs them, logged under
// `.runs/<quest>-delivery/checks/`, their `check.*` lines marked `delivery` for the metrics. Green, or set aside for
// their environment: the scan and the push go on with the new head. Anything else stops the delivery at `update`: a
// conflict leaves the plot as it was, red checks leave the merge commit on the branch, not pushed, for whoever resolves
// it. (PS-09b) Those two open the merge queue's merge quest (queue-merge.ts), which a knight resolves on this branch,
// and `delivery.failed` names it; any other stop is the owner's `deliver`. A Steward that stops records nothing; the
// next one finds the merge made (the plot's record says it is pending) and runs only what follows it. (CM-01, ADR
// 0032) On a narrow territory the checks are those the quest's diff since the new base selects, narrow commands and
// all, unless it touched what they cannot vouch for: the base branch's patrol is the full run (check-mode.ts).
import { environmentFailureOf } from '@elvaria/domain';
import { createRedactor } from '@elvaria/eventlog';
import type { DeliveryFailure, QuestId } from '@elvaria/domain';
import type { BaseUpdate, CheckRun } from '@elvaria/runner-core';

import { plotOptionsOf } from '../party/plot.ts';
import { STEWARD } from '../quest/record.ts';
import { checkModeFor, modeMarkOf } from '../review/check-mode.ts';
import { questSecretsOf } from '../sessions/secrets.ts';
import { baseRedAt } from './base-trial.ts';
import { detailOf, messageOf, stopped } from './delivery.ts';
import { lateFailAt } from './late-fail.ts';
import { openQueueMerge, redChecksOf } from './queue-merge.ts';
import type { Context } from '../context.ts';
import type { QueueChecks } from './checked-head.ts';
import type { Delivery } from './delivery.ts';
import type { Failure } from './outcome.ts';
import type { Resolvable } from './queue-merge.ts';

type Secrets = Readonly<Record<string, string>>;
type Merged = Extract<BaseUpdate, { state: 'merged' }>;
/** A stop of the update; with `resolvable`, one the merge queue's merge quest resolves (PS-09b). */
type Stop = Failure & { readonly resolvable?: Resolvable };

/** Portable, relative to the kingdom: the delivery's run folder, whose `checks/` holds the queue's check logs. */
export const deliveryRunOf = (quest: QuestId): string => `.runs/${quest}-delivery`;

const failureOf = (d: Delivery, reason: DeliveryFailure, more: Partial<Failure> = {}): Failure => ({
  stage: 'update',
  reason,
  branch: d.branch,
  ...more,
});

const roleOf = ({ party_role: role }: Delivery['quest']) => (role === undefined ? {} : { party_role: role });

/** A line of the log; one that cannot be written costs the owner a line, never the delivery. */
async function note(ctx: Context, d: Delivery, line: { type: string; data: Record<string, unknown> }) {
  try {
    await ctx.record.note({ ...line, actor: STEWARD, quest: d.quest });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${d.quest.id}: no ${line.type} line: ${messageOf(error)}`);
  }
}

/** What `check.end` says of the queue's checks: what each gave, or that they could not run or were stopped. */
function endOf(runs: readonly CheckRun[] | undefined, signal: AbortSignal) {
  if (signal.aborted) return { delivery: true, outcome: 'stopped', checks: [] };
  if (runs === undefined) return { delivery: true, outcome: 'error', checks: [] };
  const environment = environmentFailureOf(runs);
  return {
    delivery: true,
    outcome: runs.every(({ pass }) => pass) ? 'pass' : 'fail',
    checks: runs.map(({ id, pass, duration_ms }) => ({ id, pass, duration_ms })),
    ...(environment === undefined
      ? {}
      : { environment: { check: environment.check, line: environment.line } }),
  };
}

/**
 * The checks of the updated branch, every one of the territory's unless its check mode is narrow (CM-01); red ones
 * stop the delivery, set-aside ones do not.
 */
async function checkUpdate(
  ctx: Context,
  d: Delivery,
  merged: Merged,
  secrets: Secrets,
): Promise<Stop | QueueChecks | undefined> {
  const request = { plot: d.quest.plot, territory: d.territory, run_dir: deliveryRunOf(d.quest.id) };
  const mode = modeMarkOf(await checkModeFor(ctx, d.quest, d.territory, 'queue'));
  // In full, every check, as a merge quest runs them (K4); a narrow run selects by the quest's diff and role.
  const role = mode.mode === undefined ? { party_role: 'merge' as const } : roleOf(d.quest);
  await note(ctx, d, { type: 'check.start', data: { delivery: true, ...mode } });
  let runs: readonly CheckRun[] | undefined;
  try {
    runs = await ctx.deps.plots.check({ ...request, signal: d.signal, secrets, ...role, ...mode });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${d.quest.id}: the checks of its update did not run: ${messageOf(error)}`);
  }
  await note(ctx, d, { type: 'check.end', data: { ...endOf(runs, d.signal), ...mode } });
  if (stopped(d)) return undefined;
  if (runs === undefined) return failureOf(d, 'update_failed', { detail: 'the checks did not run' });
  const red = runs.filter(({ pass }) => !pass);
  const environment = environmentFailureOf(runs);
  if (red.length === 0) return runs.length > 0 && environment === undefined ? 'checked' : 'unchecked';
  if (environment !== undefined) {
    ctx.deps.log.warn(
      `steward: ${d.quest.id}: its update's checks set aside (${environment.check}: ${environment.line})`,
    );
    return 'unchecked';
  }
  const checks = red.map(({ id, timed_out }) => ({
    name: id,
    conclusion: timed_out ? 'timed_out' : 'failure',
  }));
  const stop = { reason: 'checks_red', checks: await redChecksOf(ctx, red) } as const;
  const resolvable = { stop, base: merged.base, red: { red, mode: mode.mode } };
  return { ...failureOf(d, 'checks_red', { checks }), resolvable };
}

/** The generators after the merge, then the `plot.merged` line; a failure when one failed or its commit was refused. */
async function generateAfter(ctx: Context, d: Delivery, merged: Merged, secrets: Secrets) {
  const { plots } = ctx.deps;
  const request = { quest_id: d.quest.id, secrets, signal: d.signal };
  const generated =
    plots.generate === undefined ? undefined : await plots.generate(d.quest.plot, d.territory, request);
  const restored = generated?.status === 'done' || generated?.status === 'refused' ? generated.restored : [];
  const data = {
    into: d.branch,
    merged: [d.base],
    pending: [],
    ...(merged.resolved.length === 0 ? {} : { resolved: [...merged.resolved] }),
    ...(restored.length === 0 ? {} : { restored: [...restored] }),
  };
  await note(ctx, d, { type: 'plot.merged', data });
  if (restored.length > 0)
    ctx.deps.log.warn(
      `steward: ${d.quest.id}: commands.generate changed files outside shared_paths: ${restored.join(', ')}`,
    );
  if (generated?.status === 'failed') return failureOf(d, 'generate_failed', detailOf(generated.detail));
  if (generated?.status === 'refused') return failureOf(d, 'update_failed', detailOf(generated.detail));
  return undefined;
}

/** After the merge: setup again, the generators, every check; the update settled once they passed. */
async function afterMerge(
  ctx: Context,
  d: Delivery,
  merged: Merged,
): Promise<Stop | QueueChecks | undefined> {
  let secrets: Secrets;
  try {
    secrets = await questSecretsOf(ctx, d.quest, d.territory);
    await ctx.deps.plots.prepare(d.quest, d.territory, {
      ...plotOptionsOf(ctx, d.quest, secrets),
      signal: d.signal,
    });
  } catch (error) {
    return failureOf(d, 'update_failed', { detail: createRedactor([])(messageOf(error)) });
  }
  if (stopped(d)) return undefined;
  const generated = await generateAfter(ctx, d, merged, secrets);
  if (generated !== undefined || stopped(d)) return generated;
  const checked = await checkUpdate(ctx, d, merged, secrets);
  if (typeof checked === 'object' || stopped(d)) return checked;
  await ctx.deps.plots.settle?.(d.quest.plot);
  return checked;
}

/** The update itself: the merge and its checks; undefined when already current or the Steward stopped. */
async function updateOf(ctx: Context, d: Delivery): Promise<Stop | QueueChecks | undefined> {
  const { plots } = ctx.deps;
  if (plots.update === undefined) return undefined;
  const update = await plots.update(d.quest.plot, d.territory);
  if (stopped(d) || update.state === 'current') return undefined;
  if (update.state === 'conflict') {
    const stop = { reason: 'conflict', paths: [...update.paths] } as const;
    return {
      ...failureOf(d, 'conflict', { paths: [...update.paths] }),
      resolvable: { stop, base: update.base },
    };
  }
  if (update.state === 'refused') return failureOf(d, 'update_failed', detailOf(update.detail));
  return afterMerge(ctx, d, update);
}

/**
 * The update before the scan; `checked`/`unchecked` name the queue run, undefined means current or stopped. A
 * stop the merge queue's merge quest resolves opens it (PS-09b) and the failure names it. (PS-09d) Checks red after a
 * clean merge ask the base branch first (baseRedAt): red on its own, the delivery ends with nothing recorded
 * (`base_red`), the merge commit on the branch, and the quest waits in the queue for the branch to be green. (CM-06)
 * Green there, step 4 of the probe runs the red checks on the quest's own head: red, its own change failed late, the
 * quest has left `done` and the delivery ends with nothing more recorded (`late_fail`, late-fail.ts).
 */
export async function updateBranch(
  ctx: Context,
  d: Delivery,
): Promise<Failure | QueueChecks | 'base_red' | 'late_fail' | undefined> {
  const outcome = await updateOf(ctx, d);
  if (outcome === undefined || stopped(d)) return undefined;
  if (typeof outcome === 'string') return outcome;
  const { resolvable, ...failure } = outcome;
  if (resolvable === undefined) return failure;
  if (resolvable.stop.reason === 'checks_red' && (await baseRedAt(ctx, d, resolvable.base)))
    return 'base_red';
  if (stopped(d)) return undefined;
  if (resolvable.red !== undefined && (await lateFailAt(ctx, d, resolvable.base, resolvable.red)))
    return 'late_fail';
  if (stopped(d)) return undefined;
  const merge = await openQueueMerge(ctx, d, resolvable);
  return merge === undefined ? failure : { ...failure, merge_quest: merge };
}
