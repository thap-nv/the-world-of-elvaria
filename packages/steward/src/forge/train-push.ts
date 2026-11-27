// A green delivery train's way into its base branch (CM-08, ADR 0032, ADR 0023; plans/check-modes.md "Tàu giao
// hàng"), from train.ts once its checks passed. In order: the territory's repo config holds no program git would run
// (SEC-02b), the secret scan of what the train adds over its base (ADR 0013, scan.ts: the whole diff, then each
// commit's own, as a quest's push), `git push` of its head alone as train/<territory>/<id> (never forced; the
// territory's pre-push hook runs, told the head its checks passed), one pull request naming its quests with their
// delivery notes, merged at that head with a merge commit without waiting for the forge's required checks ((621)(k):
// the Steward's run of every check is the gate), then its branch removed. A train stopped after its push removes its
// branch too, the pull request with it, so no train branch stays. After the merge the base branch is fetched: a merge
// commit whose tree is the tree the train checked needs no patrol ((613)(4)). The train's plot is gone by then: git
// runs in the territory's repo, which holds the train's commits.
import { readFile } from 'node:fs/promises';

import { createRedactor } from '@elvaria/eventlog';
import { inKingdom } from '@elvaria/store';
import type { DeliveryFailure, Quest, Territory, TrainId, TrainRun } from '@elvaria/domain';

import { deliveryNoteOf } from '../deliver/note.ts';
import { detailOf } from './delivery.ts';
import { runDeliveryGit } from './git.ts';
import { changesOf, knownOf, pushRef, secretFailure } from './push.ts';
import { repoConfigFailure } from './repo-config.ts';
import { scanDiff } from './scan.ts';
import type { Context } from '../context.ts';
import type { QueueChecks } from './checked-head.ts';
import type { GitPlace } from './delivery.ts';
import type { Forge, ForgeRepo, PullRequest, PullRequestDraft } from './forge.ts';
import type { DeliveryGit } from './git.ts';

/** A train on its way: its quests aboard, the forge's adapter and the repo, git as a delivery runs it. */
export interface Train {
  readonly ctx: Context;
  readonly id: TrainId;
  readonly run: TrainRun;
  /** The quests aboard, in the order they board. */
  readonly quests: readonly Quest[];
  /** (CM-08b) A `split` train's: only these checks run, those that went red. Absent: every check. */
  readonly checks?: readonly string[];
  readonly territory: Territory;
  readonly forge: Forge;
  readonly repo: ForgeRepo;
  readonly git: DeliveryGit;
  /** vcs.default_branch. */
  readonly base: string;
  readonly signal: AbortSignal;
}

/** The train's checked point: the base branch's commit it was cut from, its head and that head's tree. */
export interface TrainPoint {
  readonly base: string;
  readonly head: string;
  readonly tree?: string | undefined;
}

/** Why the train stopped: what each quest still aboard fails with ((621)(l)). */
export interface TrainStop {
  readonly reason: DeliveryFailure;
  readonly detail?: string;
  readonly paths?: string[];
}

/** The train merged: its pull request, the merge commit, and whether the merge's tree is the one it checked. */
export interface TrainMerged {
  readonly pr: PullRequest;
  readonly merge_sha: string;
  readonly patrolled: boolean;
}

const MS_PER_MINUTE = 60_000;
const LOCAL_GIT_TIMEOUT_MINUTES = 2;
const LOCAL_GIT_TIMEOUT_MS = LOCAL_GIT_TIMEOUT_MINUTES * MS_PER_MINUTE;
/** The fetch after the merge talks to the network. */
const FETCH_TIMEOUT_MINUTES = 5;
const FETCH_TIMEOUT_MS = FETCH_TIMEOUT_MINUTES * MS_PER_MINUTE;
/** The train branch's removal runs even once the Steward stops: a short while, then it stays (and the log says so). */
const CLEANUP_TIMEOUT_MS = MS_PER_MINUTE;

export const trainBranchOf = ({ run, id }: Pick<Train, 'run' | 'id'>): string =>
  `train/${run.territory}/${id}`;

const pushLogOf = ({ run }: Pick<Train, 'run'>): string => `.runs/train-${run.territory}-delivery/push.log`;

/** The Steward stopped: asked anew after each await, which TypeScript's narrowing cannot see (delivery.ts). */
export const stopped = (train: Pick<Train, 'signal'>): boolean => train.signal.aborted;

const placeOf = (train: Train): GitPlace => ({
  git: train.git,
  worktree: train.repo.cwd,
  signal: train.signal,
});

/** SEC-02b: no program of the repo's own config runs, before the train is built and again before its push. */
export async function configStop(train: Train): Promise<TrainStop | undefined> {
  const failure = await repoConfigFailure(train.git, train.repo.cwd, trainBranchOf(train), train.signal);
  return failure === undefined ? undefined : { reason: failure.reason, ...detailOf(failure.detail) };
}

/** The train branch removed while its tip is the train's head (its pull request closes with it); then `then`. */
async function dropped<T>(train: Train, head: string, then: T): Promise<T> {
  const signal = AbortSignal.timeout(CLEANUP_TIMEOUT_MS);
  const gone = await train.forge.deleteBranch(train.repo, trainBranchOf(train), head, signal);
  if (!gone.ok || !gone.value)
    train.ctx.deps.log.warn(`steward: ${trainBranchOf(train)} stays on the remote`);
  return then;
}

/** (613)(4) Whether the merge commit's tree is the tree the train checked: the base branch did not move meanwhile. */
async function patrolledOf(train: Train, sha: string, tree: string | undefined): Promise<boolean> {
  if (tree === undefined) return false;
  const { git, repo, signal } = train;
  const fetch = ['fetch', '--no-tags', 'origin', train.base];
  const fetched = await runDeliveryGit(git, repo.cwd, fetch, { timeout_ms: FETCH_TIMEOUT_MS, signal });
  if (fetched.code !== 0) return false;
  const args = ['rev-parse', '--verify', '--quiet', '--end-of-options', `${sha}^{tree}`];
  const named = await runDeliveryGit(git, repo.cwd, args, { timeout_ms: LOCAL_GIT_TIMEOUT_MS, signal });
  return named.code === 0 && named.output.trim() === tree;
}

/** A quest's delivery note, or its title when the note cannot be read. */
async function noteOf(ctx: Context, quest: Quest): Promise<string> {
  try {
    return (await readFile(inKingdom(ctx.root, deliveryNoteOf(quest)), 'utf8')).trim();
  } catch {
    return `# ${quest.title}`;
  }
}

/** The train's pull request: its quests in the order merged, then each one's delivery note, masked. */
async function draftOf(
  train: Train,
  merged: readonly Quest[],
  known: readonly string[],
): Promise<PullRequestDraft> {
  const notes = await Promise.all(merged.map((quest) => noteOf(train.ctx, quest)));
  const list = merged.map(({ id, title }) => `- ${title} (${id})`).join('\n');
  const text = [`# Delivery train ${train.id}`, 'Its quests, in the order merged:', list, ...notes].join(
    '\n\n',
  );
  return {
    head: trainBranchOf(train),
    base: train.base,
    title: `Delivery train ${train.id} of ${train.run.territory}`,
    body: `${createRedactor(known)(text)}\n`,
  };
}

/** The pull request opened and merged at the train's head; the branch goes whatever happened. */
async function mergeTrain(
  train: Train,
  point: TrainPoint,
  draft: PullRequestDraft,
): Promise<TrainMerged | TrainStop | undefined> {
  const { forge, repo, signal } = train;
  const opened = await forge.open(repo, draft, signal);
  if (stopped(train)) return dropped(train, point.head, undefined);
  if (!opened.ok)
    return dropped(train, point.head, { reason: opened.error.reason, ...detailOf(opened.error.detail) });
  const merged = await forge.merge(repo, opened.value.number, { method: 'merge', head: point.head }, signal);
  // Merged is merged, the Steward stopping or not: its lines are written.
  if (!merged.ok)
    return dropped(
      train,
      point.head,
      stopped(train) ? undefined : { reason: merged.error.reason, ...detailOf(merged.error.detail) },
    );
  await dropped(train, point.head, undefined);
  if (merged.value === '') return { reason: 'forge_error', detail: 'the forge names no merge commit' };
  const patrolled = await patrolledOf(train, merged.value, point.tree);
  return { pr: opened.value, merge_sha: merged.value, patrolled };
}

/**
 * The green train delivered: merged, or why it stopped; undefined when the Steward stopped before it was merged.
 * `checked`: whether its checks vouch for its head (none set aside), which the pre-push hook is told.
 */
export async function deliverTrain(
  train: Train,
  point: TrainPoint,
  checked: QueueChecks,
  merged: readonly Quest[],
): Promise<TrainMerged | TrainStop | undefined> {
  const { ctx } = train;
  const config = await configStop(train);
  if (stopped(train)) return undefined;
  if (config !== undefined) return config;
  const known = await knownOf(ctx);
  const changes = await changesOf(placeOf(train), point.base, point.head);
  if (stopped(train)) return undefined;
  if (changes === undefined)
    return { reason: 'push_refused', detail: `git cannot read the train against ${point.base}` };
  const scan = scanDiff(changes, known);
  if (scan.secrets.length > 0) {
    const { paths, detail } = secretFailure({ branch: trainBranchOf(train) }, scan, known);
    return { reason: 'secret', ...(paths === undefined ? {} : { paths }), ...detailOf(detail) };
  }
  if (scan.warnings.length > 0)
    ctx.deps.log.warn(
      `steward: ${trainBranchOf(train)}: look at ${scan.warnings.join(', ')} (a secret's shape)`,
    );
  const env = checked === 'checked' ? { ELVARIA_CHECKED_HEAD: point.head } : {};
  const refspec = `${point.head}:refs/heads/${trainBranchOf(train)}`;
  const pushed = await pushRef(ctx, placeOf(train), { refspec, log: pushLogOf(train) }, known, env);
  if (stopped(train)) return pushed.ok ? dropped(train, point.head, undefined) : undefined;
  if (!pushed.ok) return { reason: 'push_refused', detail: pushed.error };
  return mergeTrain(train, point, await draftOf(train, merged, known));
}
