// git as the PlotManager runs it: the program the composition root resolved, no shell, the host's minimal env
// without GIT_* (ADR 0013, 0015), a timeout, so a fetch waiting on credentials cannot hang a tick, and the switches of
// gitGuard: no fsmonitor, ssh command, askpass or credential helper that the territory's own config names (SEC-02).
import { childEnvOf, runProgram } from '../process/program.ts';
import { gitGuards } from '../process/git-guard.ts';
import type { ProcessHost } from '../process/program.ts';

/** Local git work (worktree add, commit, status) is quick; a fetch talks to the network. */
export const GIT_TIMEOUT_MS = 120_000;

export interface GitRun {
  /** null when git was killed after its timeout or could not start. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type Git = (cwd: string, args: readonly string[]) => Promise<GitRun>;

/** git in `cwd`, or undefined when the host finds no git. */
export async function gitOf(host: ProcessHost): Promise<Git | undefined> {
  const launch = await host.resolve('git');
  if (launch === undefined) return undefined;
  // One read of the config per folder: a plot's work is dozens of calls in the same two (46 % more time otherwise).
  const guardIn = gitGuards(launch, childEnvOf(host.env));
  return async (cwd, args) => {
    const guard = await guardIn(cwd);
    const run = await runProgram([launch.file, ...launch.args, ...guard, ...args], {
      cwd,
      env: host.env,
      timeout_ms: GIT_TIMEOUT_MS,
    });
    const stderr = run.start_error ?? (run.timed_out ? `git ${args.join(' ')}: timed out` : run.stderr);
    return { code: run.exit_code, stdout: run.stdout, stderr };
  };
}

/** stdout of a git command that must succeed; anything else is a broken plot, not a decision to make. */
export async function gitOut(git: Git, cwd: string, args: readonly string[]): Promise<string> {
  const run = await git(cwd, args);
  if (run.code !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${run.stderr.trim()}`);
  return run.stdout;
}

/** The one line a git command that may fail prints (an id), trimmed; undefined when it exits non-zero. */
export async function gitLine(git: Git, cwd: string, args: readonly string[]): Promise<string | undefined> {
  const run = await git(cwd, args);
  return run.code === 0 ? run.stdout.trim() : undefined;
}

/**
 * (RC-03, ADR 0035) The id of `commit`'s tree: two commits of the same content share it, as a forge's merge commit
 * and the queue's trial merge do, so a green check is a fact about it. Argv, never a shell, so `^{tree}` reaches git
 * as is on Windows and POSIX alike. Undefined when git cannot name it (no such commit, no commit yet).
 */
export const treeOf = (git: Git, cwd: string, commit: string): Promise<string | undefined> =>
  gitLine(git, cwd, ['rev-parse', '--verify', '--quiet', `${commit}^{tree}`]);

/**
 * The id of the tree staged in `cwd`: `git write-tree` writes it to the object store and changes nothing else, not
 * the index, not the work tree, not a ref. Undefined when it cannot (a conflict still in the index).
 */
export const stagedTreeOf = (git: Git, cwd: string): Promise<string | undefined> =>
  gitLine(git, cwd, ['write-tree']);

/**
 * The tree a run of the checks in `cwd` is a fact about (ADR 0035): HEAD's, when nothing but ignored files differs
 * from it. Undefined with a change not committed, an untracked file among them (named, whatever the territory's
 * status.showUntrackedFiles says), or no commit: such a run is no fact.
 */
export async function checkedTreeOf(git: Git, cwd: string): Promise<string | undefined> {
  const status = await git(cwd, ['status', '--porcelain', '--untracked-files=normal']);
  if (status.code !== 0 || status.stdout !== '') return undefined;
  return treeOf(git, cwd, 'HEAD');
}

/** The NUL-separated list a `-z` command prints. */
export const zList = (stdout: string): string[] => stdout.split('\0').filter((entry) => entry !== '');
