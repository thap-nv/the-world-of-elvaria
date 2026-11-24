// The try of a guest entry of the merge queue (CM-07, ADR 0032, plans/check-modes.md "mục khách"): a pull request the
// owner's own session opened, tried as the forge would merge it. Origin's default branch and the pull request's branch
// are fetched, then `git merge-tree --write-tree` merges the branch's head into origin's default branch without a
// worktree. Any conflict refuses it, even one a rule of shared_paths could resolve: the forge would refuse the merge
// all the same, and the Steward never writes to the session's branch. A clean merge becomes a commit no ref names
// (commit-tree, with the repo's identity, as the queue's own merges), tried by the territory's trial in the detached
// plot `guest-<territory>`: commands.setup, then the checks of the territory's check mode for the merge's diff
// (checkModeOf, the queue's pass): narrow commands on the paths it touched, or every check in full. The plot goes in
// the trial's `finally`, whatever happened, a stop included; only its logs stay in `.runs/guest-<territory>/`. 0 mana.
import { fromPortable } from '@elvaria/store';

import { checkModeOf } from '../checks/check-mode.ts';
import type { CheckRunMode } from '../checks/check-mode.ts';
import { plotCommitMessage } from '../plot/commit-message.ts';
import { conflictPathsOf, saidBy } from '../plot/dry-merge.ts';
import { fetchBase } from '../plot/fetch.ts';
import { gitOf, gitOut, zList } from '../plot/git.ts';
import type { Git } from '../plot/git.ts';
import { tryTerritory } from '../plot/territory-trial.ts';
import type { TerritoryTrialRequest, TerritoryTrialRun } from '../plot/territory-trial.ts';

/** The guest's plot and run id; no quest id starts with it. */
export const guestIdOf = (territory: string): string => `guest-${territory}`;

export interface GuestTrialRequest extends Omit<
  TerritoryTrialRequest,
  'name' | 'commit' | 'checks' | 'narrow' | 'inPlot' | 'stamp'
> {
  /** The pull request's branch on origin, as the forge names it. */
  readonly branch: string;
  /** The head the forge gave: the commit tried, which the forge then merges only while it is still the head. */
  readonly head: string;
}

export type GuestTrial =
  /** The head does not merge cleanly into `base`: these files conflict. */
  | { readonly state: 'conflict'; readonly base: string; readonly paths: readonly string[] }
  /** git could not fetch, merge or commit; `detail` is git's (or this module's) word. */
  | { readonly state: 'failed'; readonly detail: string }
  /** The merge `commit` of `head` into `base`, tried in `mode`. */
  | {
      readonly state: 'tried';
      readonly base: string;
      readonly commit: string;
      readonly mode: CheckRunMode;
      readonly run: TerritoryTrialRun;
    };

const failed = (detail: string): GuestTrial => ({ state: 'failed', detail });

/** Origin's default branch after a fetch, and the guest's head fetched with its branch. */
async function fetched(git: Git, repo: string, request: GuestTrialRequest): Promise<string | GuestTrial> {
  const main = request.territory.vcs.default_branch;
  if (main === undefined) return failed('the territory has no default_branch');
  if (!(await fetchBase(git, repo, main))) return failed(`git could not fetch ${main} from origin`);
  if (!(await fetchBase(git, repo, request.branch)))
    return failed(`git could not fetch ${request.branch} from origin`);
  const base = await git(repo, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `refs/remotes/origin/${main}^{commit}`,
  ]);
  if (base.code !== 0) return failed(saidBy(base));
  const head = await git(repo, ['cat-file', '-e', '--end-of-options', `${request.head}^{commit}`]);
  if (head.code !== 0) return failed(`origin's ${request.branch} has no commit ${request.head}`);
  return base.stdout.trim();
}

/** The merge of the head into `base` as a commit no ref names, or the files that conflict. */
async function mergeOf(git: Git, repo: string, request: GuestTrialRequest, base: string) {
  const tree = await git(repo, ['merge-tree', '--write-tree', '-z', '--end-of-options', base, request.head]);
  if (tree.code === 1) return { state: 'conflict', base, paths: conflictPathsOf(tree.stdout) } as const;
  if (tree.code !== 0) return failed(saidBy(tree));
  const message = plotCommitMessage.merge(request.branch, request.territory.vcs.default_branch ?? base);
  const args = [
    'commit-tree',
    tree.stdout.split('\0')[0] ?? '',
    '-p',
    base,
    '-p',
    request.head,
    '-m',
    message,
  ];
  const commit = await git(repo, args);
  return commit.code === 0 ? commit.stdout.trim() : failed(saidBy(commit));
}

/** Tries the guest; never throws for what git or the territory's commands do, only for a broken machine. */
export async function tryGuest(request: GuestTrialRequest): Promise<GuestTrial> {
  const { territory, host } = request;
  if (territory.vcs.type !== 'git') return failed('the territory has no git: no branch to try');
  const git = await gitOf(host);
  if (git === undefined) return failed('git is not found');
  const repo = fromPortable(territory.path);
  const base = await fetched(git, repo, request);
  if (typeof base !== 'string') return base;
  const commit = await mergeOf(git, repo, request, base);
  if (typeof commit !== 'string') return commit;
  const touched = zList(await gitOut(git, repo, ['diff', '--name-only', '--no-renames', '-z', base, commit]));
  const mode = checkModeOf(territory, touched, { pass: 'queue' });
  const narrow = mode === 'narrow' ? { narrow: { touched, base } } : {};
  const run = await tryTerritory({ ...request, name: guestIdOf(territory.id), commit, ...narrow });
  return { state: 'tried', base, commit, mode, run };
}
