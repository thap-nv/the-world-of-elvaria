// How runner-core starts the territory's own programs: git for plots, `commands.setup` and the checks. No shell
// (ADR 0015); an env the caller built, never process.env whole and never a GIT_* variable (ADR 0013, §6); and a
// program found by the composition root, which owns PATH (implementation-plan §1.1): there an npm `.cmd` shim on
// Windows becomes `node <script>` (§6), which Node can start without a shell.
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

import { splitCommandLine } from './command-line.ts';
import type { CommandLineIssue } from './command-line.ts';

/** How to start a program: the file to spawn and the arguments that come before the caller's own. */
export interface Launch {
  readonly file: string;
  readonly args: readonly string[];
}

/** Where a program named in a command line (`pnpm`, `node`, `git`) lives; undefined when it is not found. */
export type ProgramResolver = (name: string) => Promise<Launch | undefined>;

/** What the composition root hands runner-core to start programs with. */
export interface ProcessHost {
  readonly resolve: ProgramResolver;
  /** The minimal env of every child (implementation-plan §3.9); GIT_* names in it are dropped. */
  readonly env: Readonly<Record<string, string>>;
}

export interface CommandIssue {
  readonly reason: CommandLineIssue | 'not_found';
  readonly detail: string;
}

/**
 * The env a child gets. A GIT_* variable from the caller would point git at another repo: husky exports
 * GIT_DIR to the pre-push hook, so a commit made under it lands in the repo being pushed (implementation-plan §6).
 */
export const childEnvOf = (env: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !/^GIT_/i.test(name)));

/** `line` as the argv to spawn, its program resolved; this is also the `argv` the run-check script expects. */
export async function argvOf(
  line: string,
  resolve: ProgramResolver,
): Promise<Result<readonly string[], CommandIssue>> {
  const words = splitCommandLine(line);
  if (!words.ok) return err({ reason: words.error, detail: line });
  const [program = '', ...args] = words.value;
  const launch = await resolve(program);
  if (launch === undefined) return err({ reason: 'not_found', detail: program });
  return ok([launch.file, ...launch.args, ...args]);
}

export interface ProgramRun {
  /** null when the program was killed after its timeout, or never started. */
  readonly exit_code: number | null;
  readonly timed_out: boolean;
  readonly duration_ms: number;
  /** Empty when the output went to a file. */
  readonly stdout: string;
  readonly stderr: string;
  /** Why the program could not start (missing, not executable); undefined when it started. */
  readonly start_error?: string;
}

export interface ProgramOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeout_ms: number;
  /** An open file descriptor for stdout and stderr together (a check log); captured in the result when absent. */
  readonly output?: number;
}

/**
 * Runs `argv` to its end or its timeout. A timeout kills only the program itself: the process tree waits for
 * runner-core's kill tree (P1-06), and is why a timed-out run settles on `exit` instead of `close`, which would
 * wait for grandchildren still holding the pipes.
 */
export function runProgram(argv: readonly string[], options: ProgramOptions): Promise<ProgramRun> {
  const [file = '', ...args] = argv;
  const started = performance.now();
  const piped = options.output === undefined;
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: childEnvOf(options.env),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', options.output ?? 'pipe', options.output ?? 'pipe'],
    });
    const settle = (exitCode: number | null, startError?: string) => {
      clearTimeout(timer);
      resolve({
        exit_code: timedOut ? null : exitCode,
        timed_out: timedOut,
        duration_ms: Math.round(performance.now() - started),
        stdout,
        stderr,
        ...(startError === undefined ? {} : { start_error: startError }),
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeout_ms);
    if (piped) {
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
    }
    // A program that cannot start emits `error` and maybe no `close`.
    child.on('error', (error) => {
      settle(null, error.message);
    });
    child.on('exit', (code) => {
      // Ended on its own: the timer must not mark it timed out while the pipes drain.
      if (timedOut) settle(code);
      else clearTimeout(timer);
    });
    child.on('close', (code) => {
      settle(code);
    });
  });
}
