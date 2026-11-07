// git as the PlotManager runs it: the program the composition root resolved, no shell, the host's minimal env
// without GIT_* (ADR 0013, 0015), and a timeout, so a fetch waiting on credentials cannot hang a tick.
import { runProgram } from '../process/program.ts';
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
  return async (cwd, args) => {
    const run = await runProgram([launch.file, ...launch.args, ...args], {
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

/** The NUL-separated list a `-z` command prints. */
export const zList = (stdout: string): string[] => stdout.split('\0').filter((entry) => entry !== '');
