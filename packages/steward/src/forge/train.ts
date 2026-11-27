// The delivery train of a `deferred` territory (CM-08, ADR 0032, plans/check-modes.md "Tàu giao hàng"), outside the
// tick (planTick's train_runs), in its territory's lane (lane-runs.ts). Its quests, sealed and done, board in the
// merge queue's order: Plots.train (runner-core's tryTrain) merges each quest's branch into origin's default branch in
// the plot train-<territory>, one merge commit per quest, then runs commands.setup, commands.generate and every check
// once on the train's head, its `check.*` lines marked `delivery` and `train`. A quest whose branch conflicts outside
// every rule of shared_paths leaves the train: `delivery.failed` at stage `train` with its files and the merge queue's
// merge quest (PS-09b). Green: train-push.ts takes it into the base branch by one pull request, and each quest has its
// `delivery.merged` naming the train. Red: (CM-08b) train-probe.ts probes its merge commits, the quest found fails late
// or goes to a merge quest, those merged before it leave at once as a `split` train with the red checks only, those
// after it wait on the platform; the base branch red on its own blames nobody. Stopped ((621)(l): git, commands.generate, the scan, the push, the forge): each has
// `delivery.failed` with the reason. Every train that ran writes one `train.ran` after its quests' lines; a stop of
// the Steward before the merge writes nothing, and the next Steward builds the train anew under a new id.
// (3) A quest whose branch the base branch holds already gives the train no merge commit: it is no step of the train,
// and as a quest's branch with nothing to push (push.ts) the look at the base branch archives it (PS-08d).
import { DELIVERY_DETAIL_MAX_LENGTH, TrainIdSchema } from '@elvaria/domain';
import type { EventData, QuestId, TrainId, TrainRun } from '@elvaria/domain';
import type { TrainHead, TrainLeaving, TrainStep, TrainTrial } from '@elvaria/runner-core';

import { factsOf } from '../check-ledger/carry.ts';
import { STEWARD } from '../quest/record.ts';
import { rememberPatrolHead } from '../patrol/book.ts';
import { detailOf, foundOf, messageOf } from './delivery.ts';
import { recordFailed, recordMerged } from './outcome.ts';
import { openQueueMerge } from './queue-merge.ts';
import { branchOf, probeTrain, recordProbed } from './train-probe.ts';
import { configStop, deliverTrain, stopped } from './train-push.ts';
import { noteCheckLine, trialEndOf, trialRedOf } from './trial-red.ts';
import type { Context } from '../context.ts';
import type { QueueChecks } from './checked-head.ts';
import type { PullRequest } from './forge.ts';
import type { Failure } from './outcome.ts';
import type { TrainProbed } from './train-probe.ts';
import type { Train, TrainStop } from './train-push.ts';
import type { CheckLine } from './trial-red.ts';
type Ran = EventData<'train.ran'>;
type Tried = Extract<TrainTrial, { state: 'tried' }>;
/** What `train.ran` says beyond the train, its departure, its steps, the quests that left and its outcome. */
type RanFacts = Partial<
  Pick<Ran, 'base' | 'head' | 'tree' | 'checks' | 'base_red' | 'pr' | 'merge_sha' | 'patrolled' | 'detail'>
>;

/** The train before it is found on its forge: its id, why it left, its quests. */
type Aboard = Pick<Train, 'ctx' | 'id' | 'run' | 'quests' | 'checks'>;

/** How the train's run ended. */
interface TrainEnd {
  readonly outcome: Ran['outcome'];
  /** The quests merged into the train, each with its merge commit. */
  readonly steps: readonly TrainStep[];
  readonly left: readonly TrainLeaving[];
  /** (3) The quests whose branch the base branch holds already. */
  readonly already: readonly QuestId[];
  readonly ran: RanFacts;
  /** What each quest still aboard fails with; absent: none fails (green, red, or nobody left aboard). */
  readonly failure?: Omit<Failure, 'stage' | 'train' | 'branch'>;
  /** Green: the train's pull request. */
  readonly pr?: PullRequest;
  /** Red, the base branch green: what the probe found (train-probe.ts). */
  readonly probed?: TrainProbed;
}

const ranDetail = (detail: string | undefined): RanFacts => {
  const tail = detail?.trim().slice(-DELIVERY_DETAIL_MAX_LENGTH) ?? '';
  return tail === '' ? {} : { detail: tail };
};

type Boarded = Pick<TrainEnd, 'steps' | 'left' | 'already'>;
const NOBODY: Boarded = { steps: [], left: [], already: [] };

const stoppedEnd = (stop: TrainStop, ran: RanFacts = {}, boarded: Boarded = NOBODY): TrainEnd => ({
  ...boarded,
  outcome: 'stopped',
  ran: { ...ran, ...ranDetail(stop.detail) },
  failure: stop,
});

const markOf = (train: Pick<Train, 'id'>) => ({ delivery: true, train: train.id });

/** A `check.*` line of the train's checks (trial-red.ts). */
const note = ({ ctx, run }: Train, type: CheckLine['type'], data: CheckLine['data']) =>
  noteCheckLine(ctx, run.territory, `the train of ${run.territory}`, { type, data });

/** The train built and tried, its `check.start` once built and its `check.end` after; thrown: a broken machine. */
async function tryIt(train: Train): Promise<TrainTrial> {
  const { ctx, territory, quests, signal } = train;
  const plots = ctx.deps.plots;
  if (plots.train === undefined)
    return {
      state: 'stopped',
      reason: 'update_failed',
      detail: 'this Steward runs no train',
      steps: [],
      left: [],
    };
  let point: TrainHead | undefined;
  const started = async (given: TrainHead): Promise<void> => {
    point = given;
    await note(train, 'check.start', markOf(train));
  };
  const boarding = quests.map((quest) => ({ quest: quest.id, branch: quest.plot.branch ?? '' }));
  let tried: TrainTrial | undefined;
  try {
    const only = train.checks === undefined ? {} : { checks: train.checks };
    tried = await plots.train(territory, { quests: boarding, started, ...only }, signal);
    return tried;
  } finally {
    const trial = tried?.state === 'tried' ? tried.run.trial : undefined;
    if (point !== undefined)
      await note(train, 'check.end', {
        ...markOf(train),
        ...trialEndOf(trial, signal),
        ...factsOf(territory, point),
      });
  }
}

/** (3) The steps git made a merge commit for, and the quests whose branch `base` held already (HEAD stayed). */
function sortSteps(base: string | undefined, steps: readonly TrainStep[]) {
  const merged: TrainStep[] = [];
  const already: QuestId[] = [];
  let previous = base;
  for (const step of steps) {
    if (step.commit === previous) already.push(step.quest);
    else merged.push(step);
    previous = step.commit;
  }
  return { merged, already };
}

/** A train built and tried at its head: stopped, red and probed (train-probe.ts), or delivered by train-push.ts. */
async function endOfTried(train: Train, tried: Tried, boarded: Boarded): Promise<TrainEnd | undefined> {
  const { base, head, tree } = tried;
  const ran = { base, head, ...(tree === undefined ? {} : { tree }) };
  const { trial } = tried.run;
  if (trial.plot_failure !== undefined)
    return stoppedEnd({ reason: 'update_failed', detail: trial.plot_failure }, ran, boarded);
  let checked: QueueChecks = trial.checks.length > 0 ? 'checked' : 'unchecked';
  const red = trialRedOf(trial, (environment) => {
    checked = 'unchecked';
    train.ctx.deps.log.warn(
      `steward: the train of ${train.run.territory}: its checks set aside (${environment.check}: ${environment.line})`,
    );
  });
  if (red !== undefined) {
    const probed = await probeTrain(train, tried, boarded.steps, red);
    if (probed === undefined) return undefined;
    const end = { ...boarded, outcome: 'red' as const, ran: { ...ran, checks: red } };
    return probed === 'base_red' ? { ...end, ran: { ...end.ran, base_red: true } } : { ...end, probed };
  }
  const merged = boarded.steps.flatMap((step) => train.quests.find(({ id }) => id === step.quest) ?? []);
  const delivered = await deliverTrain(train, { base, head, tree }, checked, merged);
  if (delivered === undefined) return undefined;
  if ('reason' in delivered) return stoppedEnd(delivered, ran, boarded);
  const { pr, merge_sha, patrolled } = delivered;
  const green = { pr: pr.number, merge_sha, ...(patrolled ? { patrolled: true as const } : {}) };
  return { ...boarded, outcome: 'green', ran: { ...ran, ...green }, pr };
}

/** How the trial ends the train; undefined when the Steward stopped before anything was merged. */
async function endOfTrial(train: Train, tried: TrainTrial): Promise<TrainEnd | undefined> {
  const { merged, already } = sortSteps(tried.base, tried.steps);
  const boarded = { steps: merged, left: tried.left, already };
  const ran = tried.base === undefined ? {} : { base: tried.base };
  if (tried.state === 'stopped')
    return stoppedEnd({ reason: tried.reason, detail: tried.detail }, ran, boarded);
  // Every quest left the train, or the base branch held each one already: nobody aboard, nothing ran for anyone.
  if (tried.state === 'empty' || merged.length === 0) return { ...boarded, outcome: 'stopped', ran };
  return endOfTried(train, tried, boarded);
}

/** The train's run, from the repo's config to its end; undefined when the Steward stopped first. */
async function rideOf(train: Train): Promise<TrainEnd | undefined> {
  const config = await configStop(train);
  if (stopped(train)) return undefined;
  if (config !== undefined) return stoppedEnd(config);
  let tried: TrainTrial;
  try {
    tried = await tryIt(train);
  } catch (error) {
    return stopped(train) ? undefined : stoppedEnd({ reason: 'update_failed', detail: messageOf(error) });
  }
  return stopped(train) ? undefined : endOfTrial(train, tried);
}

/** Each quest that left the train: its merge quest of the queue (PS-09b), and its `delivery.failed` `conflict`. */
async function recordLeft(aboard: Aboard, end: TrainEnd): Promise<void> {
  const { ctx, id, run } = aboard;
  const branch = ctx.world.territories.get(run.territory)?.vcs.default_branch ?? '';
  for (const { quest: left, paths } of end.left) {
    const quest = aboard.quests.find(({ id: aboardId }) => aboardId === left);
    if (quest === undefined || end.ran.base === undefined) continue;
    const stop = { reason: 'conflict' as const, paths };
    const merge_quest = await openQueueMerge(ctx, { quest, base: branch }, { stop, base: end.ran.base });
    await recordFailed(ctx, quest, {
      stage: 'train',
      reason: 'conflict',
      train: id,
      ...branchOf(quest),
      ...(paths.length === 0 ? {} : { paths: [...paths] }),
      ...(merge_quest === undefined ? {} : { merge_quest }),
    });
  }
}

/** Green: each quest merged by the train's pull request, in the order merged. */
async function recordMergedSteps(aboard: Aboard, end: TrainEnd): Promise<void> {
  const { pr } = end;
  const { merge_sha } = end.ran;
  if (pr === undefined || merge_sha === undefined) return;
  for (const step of end.steps) {
    const quest = aboard.quests.find(({ id }) => id === step.quest);
    if (quest === undefined) continue;
    await recordMerged(aboard.ctx, quest, {
      branch: quest.plot.branch ?? '',
      head: step.head,
      pr: { number: pr.number, url: pr.url },
      merge_sha,
      method: 'merge',
      sealed: quest.seal !== undefined,
      branch_deleted: false,
      train: aboard.id,
    });
  }
  // (613)(4) A merge on the very tree the train checked is as patrolled: no patrol after a merge follows it.
  const { patrol } = aboard.ctx;
  if (end.ran.patrolled !== true || patrol.heads.get(aboard.run.territory) !== merge_sha) return;
  rememberPatrolHead(patrol, aboard.run.territory, merge_sha);
  patrol.heads.delete(aboard.run.territory);
  patrol.merges.delete(aboard.run.territory);
}

const ranOf = ({ id, run }: Aboard, end: TrainEnd): Ran => ({
  territory: run.territory,
  train: id,
  departure: run.departure,
  ...end.ran,
  steps: end.steps.map(({ quest, commit }) => ({ quest, commit })),
  ...(end.left.length === 0
    ? {}
    : { left: end.left.map(({ quest }) => ({ quest, reason: 'conflict' as const })) }),
  outcome: end.outcome,
});

/** The quests' lines first (what left, what failed or merged), then `train.ran`. */
async function recordEnd(aboard: Aboard, end: TrainEnd): Promise<void> {
  const { ctx, id, run } = aboard;
  for (const quest of end.already) ctx.forge.nothing.add(quest);
  await recordLeft(aboard, end);
  if (end.probed !== undefined) await recordProbed(aboard, end.probed);
  const off = new Set([...end.left.map(({ quest }) => quest), ...end.already]);
  if (end.failure !== undefined)
    for (const quest of aboard.quests.filter(({ id: aboardId }) => !off.has(aboardId)))
      await recordFailed(ctx, quest, { stage: 'train', train: id, ...branchOf(quest), ...end.failure });
  if (end.outcome === 'green') await recordMergedSteps(aboard, end);
  await ctx.record.note({
    type: 'train.ran',
    actor: STEWARD,
    territory: run.territory,
    data: ranOf(aboard, end),
  });
  // The owner's order sent this train off, or one given while it waited: either way it ran.
  ctx.forge.orders.delete(run.territory);
  if (end.outcome !== 'green')
    ctx.deps.log.warn(`steward: the train of ${run.territory} ended ${end.outcome}`);
}

/** The train found on its forge, or why not, as each quest's stop; undefined when none of its quests is known. */
function trainOf(aboard: Aboard, signal: AbortSignal): Train | TrainStop | undefined {
  const [first] = aboard.quests;
  if (first === undefined) return undefined;
  const found = foundOf(aboard.ctx, first, signal);
  if (!found.ok) return { reason: found.error.reason, ...detailOf(found.error.detail) };
  const { territory, forge, repo, git, base } = found.value;
  return { ...aboard, territory, forge, repo, git, base, signal };
}

/** One train's run, from its departure to its lines; (CM-08b) a `split` train runs only the `checks` given. */
export async function trainTurn(
  ctx: Context,
  run: TrainRun,
  signal: AbortSignal,
  checks?: readonly string[],
): Promise<void> {
  const id: TrainId = TrainIdSchema.parse(ctx.deps.ids.ulid());
  const quests = run.quests.flatMap((quest) => ctx.world.quests.get(quest) ?? []);
  const aboard: Aboard = { ctx, id, run, quests, ...(checks === undefined ? {} : { checks }) };
  const train = trainOf(aboard, signal);
  if (train === undefined) return;
  const end = 'ctx' in train ? await rideOf(train) : stoppedEnd(train);
  if (end === undefined) return;
  await recordEnd(aboard, end);
  const split = end.probed === undefined ? [] : end.probed.split.before;
  if (end.probed !== undefined && split.length > 0)
    await trainTurn(ctx, { ...run, departure: 'split', quests: split }, signal, end.probed.checks);
}

/** Starts the train `run` outside the tick, in its territory's lane (planTick's train_runs). */
export function startTrain(ctx: Context, run: TrainRun): void {
  ctx.trains.start(run.territory, `the train of ${run.territory}`, (signal) => trainTurn(ctx, run, signal));
}
