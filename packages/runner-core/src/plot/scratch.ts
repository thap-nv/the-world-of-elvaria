// The judge's scratch plot (implementation-plan §3.15, ADR 0022; P1-20): a disposable worktree `<quest-id>-verify`
// beside the quest's own, detached at the head of `quest/<id>`, so nothing done there can move the quest's branch:
// there is no branch to commit to, and the judge's hook refuses every git command that writes a ref. It is made
// fresh for each judge (the machine checks run there first, with commands.setup and commands.reset; for the run's
// next judge on an unmoved branch head, commands.setup alone, the last judge's trial serving it, P1-42) and removed,
// dirty or not, after the judge's session: what the judge broke on purpose is never kept.
import { err, ok } from '@elvaria/domain';
import type { Plot, Result } from '@elvaria/domain';
import { pathExists, toPortable } from '@elvaria/store';

import { gitOut } from './git.ts';
import type { Git } from './git.ts';
import { clearLeftover } from './leftover.ts';
import { gitDirOf, plotRecordOf, writePlotRecord } from './plot-record.ts';
import { runSetup } from './setup.ts';
import type { ProcessHost } from '../process/program.ts';
import type { PlotRecord } from './plot-record.ts';
import type { ForgetWorktree } from './worktree-ops.ts';
import type { PlotFailure } from './worktree.ts';

/** After the quest id: the scratch plot's folder, beside the quest's own worktree. */
export const SCRATCH_SUFFIX = '-verify';

export const scratchIdOf = (questId: string): string => `${questId}${SCRATCH_SUFFIX}`;

export interface ScratchTarget {
  readonly git: Git;
  /** The territory's checkout, native. */
  readonly repo: string;
  /** `<repo>/<worktree_dir>/<quest-id>-verify`, native. */
  readonly worktree: string;
  /** The quest's own worktree, native: its record names the base the branch forked from. */
  readonly quest_worktree: string;
  /** `quest/<quest-id>`. */
  readonly branch: string;
}

export interface MadeScratch {
  readonly git_dir: string;
  readonly record: PlotRecord;
  /** The commit the scratch plot stands on: the head of the quest's branch. */
  readonly head: string;
}

/**
 * Removes the scratch worktree whatever it holds (`--force` twice: dirty, or locked by a crash), then what git and
 * the tribes' CLIs remember of it; nothing when there is none. The folder of a program that still holds it stays,
 * named in the result, for the next removal.
 */
export async function removeScratch(
  git: Git,
  target: Pick<ScratchTarget, 'repo' | 'worktree'>,
  forget: readonly ForgetWorktree[],
): Promise<string | undefined> {
  const { repo, worktree } = target;
  if (await pathExists(worktree)) await git(repo, ['worktree', 'remove', '--force', '--force', worktree]);
  await git(repo, ['worktree', 'prune']);
  const leftover = await clearLeftover(worktree);
  await Promise.allSettled(forget.map((drop) => drop(worktree)));
  return leftover;
}

/** A fresh scratch worktree at the head of the quest's branch, its record carrying the quest plot's base. */
export async function makeScratch(
  target: ScratchTarget,
  forget: readonly ForgetWorktree[],
): Promise<Result<MadeScratch, PlotFailure>> {
  const { git, repo, worktree, branch } = target;
  if (!(await pathExists(target.quest_worktree)))
    return err({ reason: 'git_failed', detail: `${target.quest_worktree}: the quest has no plot to judge` });
  const base = (await plotRecordOf(git, target.quest_worktree)).base;
  const leftover = await removeScratch(git, target, forget);
  if (leftover !== undefined) return err({ reason: 'path_taken', detail: leftover });
  const added = await git(repo, ['worktree', 'add', '--quiet', '--detach', worktree, branch]);
  if (added.code !== 0) return err({ reason: 'git_failed', detail: added.stderr.trim() });
  const gitDir = await gitDirOf(git, worktree);
  const record: PlotRecord = { version: 1, base, setup_done: false };
  await writePlotRecord(gitDir, record);
  const head = (await gitOut(git, worktree, ['rev-parse', 'HEAD'])).trim();
  return ok({ git_dir: gitDir, record, head });
}

/**
 * The scratch plot on `ref`, detached, what changed there dropped (tracked and untracked; ignored files such as
 * node_modules stay): the trial measures coverage on the base, then comes back to the head for the judge.
 */
export async function checkoutScratch(git: Git, worktree: string, ref: string): Promise<void> {
  await gitOut(git, worktree, ['clean', '--quiet', '-d', '--force']);
  await gitOut(git, worktree, ['checkout', '--quiet', '--force', '--detach', ref]);
}

/** The scratch plot as a session and the checks see it: a worktree without a branch of its own. */
export const scratchPlotOf = (worktree: string): Plot => ({ type: 'worktree', path: toPortable(worktree) });

/** A scratch plot ready for the trial and the judge. */
export interface PreparedScratch {
  readonly plot: Plot;
  /** Native: the checks' and the judge's cwd. */
  readonly worktree: string;
  /** The commit the quest's branch forked from: the trial measures coverage there too. */
  readonly base: string;
  /** The head of the quest's branch, where the scratch plot stands. */
  readonly head: string;
}

export interface ScratchSetup {
  readonly kingdom: string;
  readonly host: ProcessHost;
  readonly forget: readonly ForgetWorktree[];
  /** The territory's commands.setup. */
  readonly command: string | undefined;
  /** The quest's secrets for setup, as its own plot's setup gets them (P1-30). */
  readonly secrets?: Readonly<Record<string, string>>;
}

/**
 * A fresh scratch plot after commands.setup, its log at `.runs/<quest>-verify-setup.log`; a setup that fails is a
 * `setup_failed` naming that log, which the trial reports as its `rerun_clean` check.
 */
export async function prepareScratch(
  target: ScratchTarget,
  questId: string,
  setup: ScratchSetup,
): Promise<Result<PreparedScratch, PlotFailure>> {
  const made = await makeScratch(target, setup.forget);
  if (!made.ok) return made;
  const ran = await runSetup({
    kingdom: setup.kingdom,
    quest_id: scratchIdOf(questId),
    worktree: target.worktree,
    git_dir: made.value.git_dir,
    record: made.value.record,
    command: setup.command,
    host: setup.host,
    ...(setup.secrets === undefined ? {} : { secrets: setup.secrets }),
  });
  if (!ran.ok) return ran;
  const { worktree } = target;
  return ok({ plot: scratchPlotOf(worktree), worktree, base: made.value.record.base, head: made.value.head });
}
