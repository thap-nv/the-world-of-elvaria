// Starting an agent CLI and reading it line by line, for an adapter whose CLI takes its prompt in argv (Antigravity;
// runner-claude writes the prompt to stdin and keeps its own spawn). Moved from runner-antigravity with the kill
// tree (P1-06; ADR 0006 amended after P1-09): starting a process and stopping its tree is not any one CLI's.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { killTree } from './kill-tree.ts';
import type { Launch } from './program.ts';

export interface ChildOptions {
  readonly cwd?: string;
  readonly env: Readonly<Record<string, string>>;
  /** stderr as it comes, in any chunks: the run's stderr.log (openRunOutput). */
  readonly onStderr?: (chunk: string) => void;
  /** POSIX: how long SIGTERM has before SIGKILL when the child is killed (KILL_GRACE_MS by default). */
  readonly kill_grace_ms?: number;
}

export interface ChildExit {
  /** null when the process ended on a signal or never started. */
  readonly code: number | null;
  readonly signal: string | null;
  /** Why it never started (ENOENT, EACCES), if it did not. */
  readonly failure?: string;
}

/** Keep the end of stderr: a CLI's last error is its last line, and a runaway stream must not fill memory. */
const STDERR_LIMIT = 64 * 1024;

export interface Child {
  readonly pid: number;
  readonly exit: Promise<ChildExit>;
  /** stderr so far, its last 64 KiB. */
  stderr(): string;
  /** Kills the child's whole tree (killTree); a no-op once it has ended. */
  kill(): void;
}

/** Spawns `launch` + `args` without a shell (ADR 0015), stdin closed, each stdout line handed to `onLine`. */
export function startChild(
  launch: Launch,
  args: readonly string[],
  options: ChildOptions,
  onLine: (line: string) => void,
): Child {
  const child = spawn(launch.file, [...launch.args, ...args], {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_LIMIT);
    options.onStderr?.(chunk);
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on('line', onLine);
  const exit = new Promise<ChildExit>((resolve) => {
    child.once('error', (error) => {
      resolve({ code: null, signal: null, failure: error.message });
    });
    child.once('close', (code, signal) => {
      resolve({ code, signal });
    });
  });
  const kill = (): void => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const grace = options.kill_grace_ms === undefined ? {} : { grace_ms: options.kill_grace_ms };
    void killTree(child.pid ?? 0, grace);
  };
  return { pid: child.pid ?? 0, exit, stderr: () => stderr, kill };
}

export interface ChildRun extends ChildExit {
  readonly stdout: string;
  readonly stderr: string;
  readonly timed_out: boolean;
}

/** Runs a short command to its end (`--version`, `/usage`): all of stdout, its tree killed after `timeout_ms`. */
export async function runToEnd(
  launch: Launch,
  args: readonly string[],
  options: ChildOptions & { readonly timeout_ms: number },
): Promise<ChildRun> {
  const out: string[] = [];
  const child = startChild(launch, args, options, (line) => out.push(line));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, options.timeout_ms);
  const exit = await child.exit;
  clearTimeout(timer);
  return { ...exit, stdout: out.join('\n'), stderr: child.stderr(), timed_out: timedOut };
}
