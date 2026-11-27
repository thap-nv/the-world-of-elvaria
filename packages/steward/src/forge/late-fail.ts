// Step 4 of the probe at the merge queue (CM-06, ADR 0032, ADR 0033; plans/check-modes.md "Ở hàng đợi"): checks red
// after the queue merged a green base branch into a done quest's branch are run on the quest's own head, as its judge
// passed it, in the territory's patrol lane (the plot `probe-<id>` is the probe's). Red there: the quest's own change,
// so a late machine verdict overturns that pass, the quest leaves `done` (verdict_fail, §2.5: back to its doer, to
// the machine, or to the infirmary out of runs), the judge who passed it shares the fail, and a quest the delegation
// spared the seal suspends its territory's delegation (signal (3) of PS-08g). Green, or a run that cannot say: the
// merge of both sides is red, and the merge queue's merge quest resolves it as before (PS-09b). A check that ran green
// after the session with the very command the queue ran it with is not run again: it proves a `combination`. A quest
// of the script tier has no judge to overturn and keeps the old way. Every conclusion writes one `check.attributed`
// (`source: queue`), which the patrol's health leaves alone.
import {
  currentRun,
  lateFailSuspension,
  ownRunChecksOf,
  probeChecksOf,
  probeRunOf,
  queueAttributionOf,
  questHeadOf,
  sessionModeOf,
  verdictIdOf,
} from '@elvaria/domain';
import { toVerdictCheck } from '@elvaria/runner-core';
import type { ProbeRun, Quest } from '@elvaria/domain';
import type { CheckRun } from '@elvaria/runner-core';

import { suspendDelegation } from '../delegation/suspend.ts';
import { OUT_OF_ATTEMPTS } from '../quest/infirmary.ts';
import { STEWARD } from '../quest/record.ts';
import { overturnedEdits, writeLateVerdict } from '../review/late-verdict.ts';
import { moveOnVerdict } from '../review/verdicts.ts';
import { messageOf, stopped } from './delivery.ts';
import type { Context } from '../context.ts';
import type { Plots } from '../types.ts';
import type { Delivery } from './delivery.ts';

type ProbePlots = Required<Pick<Plots, 'probe' | 'commitLinks'>> & Pick<Plots, 'head'>;

/** The queue's red run: its red checks and the mode it ran them in. */
export interface QueueRed {
  readonly red: readonly CheckRun[];
  readonly mode: 'narrow' | undefined;
}

/** The red checks step 4 runs: those the run after the session did not prove green with the queue's command. */
async function toRunOf(ctx: Context, d: Delivery, queue: QueueRed): Promise<string[]> {
  const pass = await ctx.deps.store.verdicts.read(verdictIdOf(d.quest, currentRun(d.quest)));
  const events = (await ctx.deps.events.read()).events;
  return ownRunChecksOf({
    red: queue.red.map(({ id }) => id),
    session: pass.ok ? pass.value.checks : [],
    session_mode: sessionModeOf(events, d.quest.id),
    queue_mode: queue.mode,
    checks: d.territory.checks,
  });
}

/** A run of step 4 that cannot say: git could not find the quest's own head, or the run failed. */
const unknownRun = (d: Delivery, commit: string): ProbeRun => ({
  commit,
  quest: d.quest.id,
  red: undefined,
  duration_ms: 0,
});

/** The run on the quest's own head, before the queue's merge of `base`; one that cannot say when git cannot. */
async function ownRunOf(plots: ProbePlots, d: Delivery, base: string, checks: readonly string[]) {
  const head = await plots.head(d.quest.plot);
  if (head === null) return unknownRun(d, base);
  const links = await plots.commitLinks(d.territory, head, base);
  if (links === undefined) return unknownRun(d, head);
  const own = questHeadOf(links, head);
  const trial = await plots.probe(d.territory, own, probeChecksOf(checks), d.signal);
  return probeRunOf(trial, own, d.quest.id);
}

/** Step 4 in the territory's patrol lane; undefined when every red check is proven green, or the run failed. */
async function stepFour(ctx: Context, d: Delivery, plots: ProbePlots, base: string, checks: string[]) {
  if (checks.length === 0) return undefined;
  try {
    return await ctx.patrol.runs.exclusive(d.territory.id, () => ownRunOf(plots, d, base, checks));
  } catch (error) {
    ctx.deps.log.warn(`steward: ${d.quest.id}: the probe of its own head failed: ${messageOf(error)}`);
    return unknownRun(d, base);
  }
}

/**
 * The late fail of the quest's own change: its verdict, its move back with the judge's share, the breaker. (CM-08b) The
 * probe of a red delivery train fails its quest the same way (train-probe.ts).
 */
export async function failLate(ctx: Context, quest: Quest, red: readonly CheckRun[]): Promise<boolean> {
  const [first] = red;
  if (first === undefined) return false;
  const late = await writeLateVerdict(ctx, quest, red.map(toVerdictCheck));
  if (!late.ok) {
    ctx.deps.log.warn(`steward: ${quest.id}: no late verdict: ${late.error}`);
    return false;
  }
  const moved = await moveOnVerdict(ctx, quest, late.value.verdict, {
    event: { type: 'verdict_fail' },
    actor: 'steward',
    edits: overturnedEdits(ctx, quest, late.value),
    infirmary: OUT_OF_ATTEMPTS,
  });
  if (!moved.ok) {
    ctx.deps.log.warn(`steward: ${quest.id}: its late fail did not move it: ${moved.error}`);
    return false;
  }
  const suspension = lateFailSuspension({ quest, check: first.id }, ctx.delegation.suspensions);
  if (suspension !== undefined) await suspendDelegation(ctx, suspension);
  return true;
}

/**
 * Step 4 for the queue's red run after a clean merge of `base`: true once the quest's own change is found red and the
 * quest has left `done`, so the delivery ends there; false for a merge quest, as before, or when the Steward stopped.
 */
export async function lateFailAt(ctx: Context, d: Delivery, base: string, queue: QueueRed): Promise<boolean> {
  const all = ctx.deps.plots;
  const probe = all.probe?.bind(all);
  const commitLinks = all.commitLinks?.bind(all);
  if (d.quest.tier !== 'session' || probe === undefined || commitLinks === undefined) return false;
  const plots: ProbePlots = { probe, commitLinks, head: all.head.bind(all) };
  const checks = queue.red.map(({ id }) => id);
  const run = await stepFour(ctx, d, plots, base, await toRunOf(ctx, d, queue));
  if (stopped(d)) return false;
  const data = queueAttributionOf({
    territory: d.territory.id,
    quest: d.quest.id,
    checks,
    ...(run === undefined ? {} : { run }),
  });
  await ctx.record.note({ type: 'check.attributed', actor: STEWARD, quest: d.quest, data });
  return data.cause === 'own_change' && (await failLate(ctx, d.quest, queue.red));
}
