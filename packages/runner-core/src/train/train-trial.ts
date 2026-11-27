// The delivery train of a `deferred` territory (CM-08, ADR 0032, plans/check-modes.md "Tàu giao hàng"), built and tried
// in the detached plot `train-<territory>` cut from origin's default branch once fetched. Each sealed quest's branch is
// merged there in the order given, as the merge queue merges (dry-merge.ts: merge-tree first, then the real merge with
// the rules of shared_paths and the territory's hooks), one merge commit per quest; a quest whose branch conflicts
// outside every rule leaves the train with its files, and the train goes on. Then commands.setup (the lockfiles are
// merged), commands.generate (it needs the deps; no quest's secrets, the train is no quest's) and every check, its
// `run`, as a party's merge quest runs them: merge ⇒ setup ⇒ generate ⇒ checks. The plot goes whatever happened
// (tryTerritory); only its logs stay, in `.runs/train-<territory>/` and `.runs/train-<territory>-delivery/`. The push,
// the pull request and every line are the Steward's. 0 mana.
import type { QuestId } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { dryMerge, mergeResolved } from '../plot/dry-merge.ts';
import type { SharedPaths } from '../plot/dry-merge.ts';
import { originTipOf } from '../plot/fetch.ts';
import { generateIn } from '../plot/generate.ts';
import { gitLine, gitOf, treeOf } from '../plot/git.ts';
import type { Git } from '../plot/git.ts';
import { tryTerritory } from '../plot/territory-trial.ts';
import type { TerritoryTrialRequest, TerritoryTrialRun } from '../plot/territory-trial.ts';
import { checksIn, setupStep } from '../plot/territory/trial-steps.ts';
import type { TrialSteps } from '../plot/territory/trial-steps.ts';

/** The train's plot and run id; no quest id starts with it. */
export const trainPlotOf = (territory: string): string => `train-${territory}`;

/** A quest on the platform: its plot's branch, in the territory's repo. */
export interface TrainBoarding {
  readonly quest: QuestId;
  readonly branch: string;
}

/** The train's head once built, the commit its checks run on, and that commit's tree when git can name it. */
export interface TrainHead {
  readonly head: string;
  readonly tree?: string;
}

export interface TrainTrialRequest extends Omit<
  TerritoryTrialRequest,
  'name' | 'commit' | 'narrow' | 'inPlot' | 'stamp' | 'carried' | 'steps'
> {
  /**
   * (CM-08b) Only these checks, by id: a `split` train, the quests before the culprit of a red one, runs again only
   * the checks that went red (ADR 0032). Every check when absent.
   */
  readonly checks?: readonly string[];
  /** The quests in the order they board. */
  readonly quests: readonly TrainBoarding[];
  /** Told once the train is built, right before its checks run: the Steward's `check.start`. */
  readonly started?: (point: TrainHead) => Promise<void>;
}

/** A quest merged into the train: the merge `commit`, and the quest's `head` it merged (its second parent). */
export interface TrainStep {
  readonly quest: QuestId;
  readonly commit: string;
  readonly head: string;
}

/** A quest that left the train: these files of its branch conflict outside every rule of shared_paths. */
export interface TrainLeaving {
  readonly quest: QuestId;
  readonly paths: readonly string[];
}

/** Why a train could not run its course: git (fetch, plot, merge, a hook), or commands.generate. */
export type TrainStop = 'update_failed' | 'generate_failed';

interface Boarded {
  readonly steps: readonly TrainStep[];
  readonly left: readonly TrainLeaving[];
}

export type TrainTrial =
  /** Nothing to check; `base` is absent when origin's branch could not be read. */
  | (Boarded & {
      readonly state: 'stopped';
      readonly reason: TrainStop;
      readonly detail: string;
      readonly base?: string;
    })
  /** Every quest left the train: no command ran. */
  | (Boarded & { readonly state: 'empty'; readonly base: string })
  /** The train built on `base` and tried at `head`: `run` holds setup and the checks (none when setup failed). */
  | (Boarded &
      TrainHead & { readonly state: 'tried'; readonly base: string; readonly run: TerritoryTrialRun });

/** What the plot's steps learnt, beyond the trial's own steps. */
interface Built {
  steps: TrainStep[];
  left: TrainLeaving[];
  stop?: { readonly reason: TrainStop; readonly detail: string };
  head?: string;
  tree?: string;
}

const stopped = (detail: string): TrainTrial => ({
  state: 'stopped',
  reason: 'update_failed',
  detail,
  steps: [],
  left: [],
});

interface Merging {
  readonly quest: QuestId;
  readonly branch: string;
  readonly into: string;
  readonly shared: SharedPaths;
}

/** One quest merged into the plot's HEAD: its step, the files that make it leave, or why git could not. */
async function boardOne(
  git: Git,
  worktree: string,
  merging: Merging,
): Promise<TrainStep | TrainLeaving | string> {
  const { quest, branch, into, shared } = merging;
  const ref = `refs/heads/${branch}^{commit}`;
  const head = await gitLine(git, worktree, ['rev-parse', '--verify', '--quiet', '--end-of-options', ref]);
  if (head === undefined) return `the repo has no branch ${branch}`;
  const dry = await dryMerge(git, worktree, head, shared);
  if (dry.state === 'failed') return dry.detail;
  if (dry.state === 'conflict') return { quest, paths: dry.paths };
  const files = dry.state === 'resolvable' ? dry.files : [];
  const refused = await mergeResolved(git, worktree, { into, branch, commit: head }, files);
  if (refused?.state === 'conflict') return { quest, paths: refused.paths };
  if (refused !== undefined) return refused.detail;
  const commit = await gitLine(git, worktree, ['rev-parse', '--verify', 'HEAD']);
  return commit === undefined ? 'git could not name the merge of the train' : { quest, commit, head };
}

/** Every quest merged in turn; the first that git cannot merge stops the train. */
async function board(git: Git, worktree: string, request: TrainTrialRequest, built: Built): Promise<void> {
  const { territory } = request;
  const into = territory.vcs.default_branch ?? 'HEAD';
  const shared = territory.shared_paths ?? [];
  for (const { quest, branch } of request.quests) {
    const boarded = await boardOne(git, worktree, { quest, branch, into, shared });
    if (typeof boarded === 'string') {
      built.stop = { reason: 'update_failed', detail: boarded };
      return;
    }
    if ('paths' in boarded) built.left.push(boarded);
    else built.steps.push(boarded);
  }
  const last = built.steps.at(-1);
  if (last !== undefined) built.head = last.commit;
}

/** The generators on the built train (no quest's secrets: the train is no quest's): its head after, or why not. */
async function generated(git: Git, request: TrainTrialRequest, worktree: string, head: string) {
  const { kingdom, territory, host, signal } = request;
  const outcome = await generateIn(git, {
    kingdom,
    quest_id: trainPlotOf(territory.id),
    worktree,
    into: territory.vcs.default_branch ?? 'HEAD',
    commands: territory.commands.generate ?? [],
    shared: territory.shared_paths ?? [],
    host,
    ...(signal === undefined ? {} : { signal }),
  });
  if (outcome.status === 'failed' || outcome.status === 'refused')
    return { reason: 'generate_failed', detail: outcome.detail } as const;
  return (outcome.status === 'done' ? outcome.sha : undefined) ?? head;
}

/** What runs in the train's plot: the merges, setup, the generators, then every check. */
async function trainSteps(
  git: Git,
  request: TrainTrialRequest,
  worktree: string,
  built: Built,
): Promise<TrialSteps> {
  await board(git, worktree, request, built);
  if (built.stop !== undefined || built.head === undefined) return { setup: null, checks: [] };
  const named = { ...request, name: trainPlotOf(request.territory.id) };
  const setup = await setupStep(named, worktree);
  if (setup !== null && !setup.pass) return { setup, checks: [] };
  const head = await generated(git, request, worktree, built.head);
  if (typeof head !== 'string') {
    built.stop = head;
    return { setup, checks: [] };
  }
  const tree = await treeOf(git, worktree, head);
  const point = { head, ...(tree === undefined ? {} : { tree }) };
  Object.assign(built, point);
  await request.started?.(point);
  return { setup, checks: await checksIn(named, worktree) };
}

/** The train's outcome from what its plot learnt and the trial's run. */
function trialOf(base: string, built: Built, run: TerritoryTrialRun): TrainTrial {
  const boarded = { base, steps: built.steps, left: built.left };
  const failure = run.trial.plot_failure;
  if (failure !== undefined)
    return { ...boarded, state: 'stopped', reason: 'update_failed', detail: failure };
  if (built.stop !== undefined) return { ...boarded, state: 'stopped', ...built.stop };
  if (built.head === undefined) return { ...boarded, state: 'empty' };
  const tree = built.tree === undefined ? {} : { tree: built.tree };
  return { ...boarded, state: 'tried', head: built.head, ...tree, run };
}

/** Builds and tries the train; never throws for what git or the territory's commands do, only for a broken machine. */
export async function tryTrain(request: TrainTrialRequest): Promise<TrainTrial> {
  const { territory, host } = request;
  if (territory.vcs.type !== 'git') return stopped('the territory has no git: no train to build');
  const main = territory.vcs.default_branch;
  if (main === undefined) return stopped('the territory has no default_branch');
  const git = await gitOf(host);
  if (git === undefined) return stopped('git is not found');
  const base = await originTipOf(git, fromPortable(territory.path), main);
  if ('detail' in base) return stopped(base.detail);
  const built: Built = { steps: [], left: [] };
  const run = await tryTerritory({
    ...request,
    name: trainPlotOf(territory.id),
    commit: base.commit,
    steps: (worktree) => trainSteps(git, request, worktree, built),
  });
  return trialOf(base.commit, built, run);
}
