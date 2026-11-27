// The probe of a red delivery train (CM-08b, ADR 0032, ADR 0033; plans/check-modes.md "Tàu giao hàng của `deferred`").
// First the base branch: red there on its own (base-trial.ts), the train blames nobody, no quest fails and each waits
// on the platform for a green patrol. Else, in the territory's patrol lane (the plot `probe-<id>` is the patrol's), the
// patrol's probe (patrol/probe-run.ts) over the train's own merge commits (trainProbePlanOf), the red checks only: its
// steps are commits no branch names once the train's plot went, still in the repo's objects. One `check.attributed`
// (`source: train`), then who leaves how (trainSplitOf): the quest found is blamed, a late verdict for its own change
// (late-fail.ts) or the merge queue's merge quest for a combination (PS-09b); the quests merged before it leave at once
// as a `split` train with the red checks only (train.ts); those after it, or every quest when nobody is found, go back
// to the platform, and the TRAIN_RIDES_MAX-th red ride fails one to the owner (outOfRidesOf). A stop of the Steward
// during the probe records nothing.
import {
  attributionOf,
  isPatrolFix,
  outOfRidesOf,
  probeChecksOf,
  trainProbePlanOf,
  trainRidesOf,
  trainSplitOf,
} from '@elvaria/domain';
import type { CheckAttributedData, ProbeDone, Quest, TrainSplit } from '@elvaria/domain';
import type { TrainStep, TrainTrial } from '@elvaria/runner-core';

import { probeFrom, probePlotsOf } from '../patrol/probe-run.ts';
import { STEWARD } from '../quest/record.ts';
import { baseRedAt } from './base-trial.ts';
import { messageOf } from './delivery.ts';
import { failLate } from './late-fail.ts';
import { recordFailed } from './outcome.ts';
import { openQueueMerge, redChecksOf } from './queue-merge.ts';
import { stopped } from './train-push.ts';
import type { Probed } from '../patrol/probe-run.ts';
import type { Failure } from './outcome.ts';
import type { Train } from './train-push.ts';
import type { TrialRed } from './trial-red.ts';

type Tried = Extract<TrainTrial, { state: 'tried' }>;
type Trial = Tried['run']['trial'];

/** What the probe of a red train found, for the quests' lines. */
export interface TrainProbed {
  readonly data: CheckAttributedData;
  readonly split: TrainSplit;
  /** The red checks without commands.setup: the `split` train runs only these. */
  readonly checks: readonly string[];
  readonly red: TrialRed;
  readonly trial: Trial;
  /** The base branch's commit the train was cut from: the merge quest's. */
  readonly base: string;
}

const UNKNOWN: ProbeDone = { kind: 'done', cause: 'unknown' };

/** A quest's branch, for its `delivery.failed`. */
export const branchOf = ({ plot }: Quest) => (plot.branch === undefined ? {} : { branch: plot.branch });

/** The red checks as the forge names them, for each `delivery.failed` `checks_red`. */
export const forgeChecksOf = (red: TrialRed) =>
  red.map(({ id, timed_out }) => ({ name: id, conclusion: timed_out === true ? 'timed_out' : 'failure' }));

/** The probe's runs in the patrol lane; unknown when this Steward has no plot to probe in, or one broke. */
async function runsOf(train: Train, tried: Tried, steps: readonly TrainStep[], checks: readonly string[]) {
  const { ctx, territory, signal } = train;
  const plots = probePlotsOf(ctx.deps.plots);
  if (plots === undefined) return { runs: [], done: UNKNOWN };
  const plan = trainProbePlanOf({ base: tried.base, head: tried.head, steps });
  try {
    const probe = { plots, territory, checks, signal };
    return await ctx.patrol.runs.exclusive(territory.id, () => probeFrom(probe, plan, []));
  } catch (error) {
    if (signal.aborted) return undefined;
    ctx.deps.log.warn(`steward: the probe of the train of ${territory.id} failed: ${messageOf(error)}`);
    return { runs: [], done: UNKNOWN } satisfies Probed;
  }
}

/**
 * The probe of the train `tried` red: `base_red` when the base branch is red on its own (the patrol's own fix, which
 * mends it, is never held by it), undefined once the Steward stopped.
 */
export async function probeTrain(
  train: Train,
  tried: Tried,
  steps: readonly TrainStep[],
  red: TrialRed,
): Promise<TrainProbed | 'base_red' | undefined> {
  const { ctx, territory, signal } = train;
  const fixing = train.quests.some(isPatrolFix);
  const baseRed = !fixing && (await baseRedAt(ctx, { territory, signal }, tried.base));
  if (stopped(train)) return undefined;
  if (baseRed) return 'base_red';
  const checks = red.map(({ id }) => id);
  const probed = await runsOf(train, tried, steps, checks);
  if (probed === undefined || stopped(train)) return undefined;
  const data = attributionOf({ territory: territory.id, source: 'train', checks, ...probed });
  const split = trainSplitOf(
    probed.done,
    steps.map(({ quest }) => quest),
  );
  const { base, run } = tried;
  return { data, split, checks: probeChecksOf(checks), red, trial: run.trial, base };
}

type Aboard = Pick<Train, 'ctx' | 'id' | 'quests'>;

const failureOf = (aboard: Aboard, probed: TrainProbed, quest: Quest): Failure => ({
  stage: 'train',
  reason: 'checks_red',
  train: aboard.id,
  ...branchOf(quest),
  checks: forgeChecksOf(probed.red),
});

/** The red runs with their logs: commands.setup's alone when it failed, as trialRedOf. */
const redRunsOf = ({ setup, checks }: Trial) =>
  setup !== null && !setup.pass
    ? [{ id: 'setup', log_path: setup.log_path }]
    : checks.filter(({ pass }) => !pass);

/** The quest found: a late fail of its own change (a session's), else the merge queue's merge quest or the owner's. */
async function blame(aboard: Aboard, probed: TrainProbed, quest: Quest): Promise<void> {
  const { ctx } = aboard;
  const red = probed.trial.checks.filter(({ pass }) => !pass);
  if (probed.data.cause === 'own_change') {
    if (quest.tier === 'session' && (await failLate(ctx, quest, red))) return;
    await recordFailed(ctx, quest, failureOf(aboard, probed, quest));
    return;
  }
  const branch = ctx.world.territories.get(quest.territory)?.vcs.default_branch ?? '';
  const stop = { reason: 'checks_red', checks: await redChecksOf(ctx, redRunsOf(probed.trial)) } as const;
  const merge_quest = await openQueueMerge(ctx, { quest, base: branch }, { stop, base: probed.base });
  const named = merge_quest === undefined ? {} : { merge_quest };
  await recordFailed(ctx, quest, { ...failureOf(aboard, probed, quest), ...named });
}

/** The probe's lines, before the train's `train.ran`: `check.attributed`, the quest found's, each out of rides. */
export async function recordProbed(aboard: Aboard, probed: TrainProbed): Promise<void> {
  const { ctx, quests } = aboard;
  const culprit = quests.find(({ id }) => id === probed.split.culprit);
  const about = culprit === undefined ? { territory: probed.data.territory } : { quest: culprit };
  await ctx.record.note({ type: 'check.attributed', actor: STEWARD, ...about, data: probed.data });
  if (culprit !== undefined) await blame(aboard, probed, culprit);
  const events = (await ctx.deps.events.read()).events;
  const out = outOfRidesOf(trainRidesOf(events, quests), probed.split.after);
  for (const quest of quests.filter(({ id }) => out.includes(id)))
    await recordFailed(ctx, quest, failureOf(aboard, probed, quest));
}
