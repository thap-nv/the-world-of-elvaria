// Starting a CLI and reading it: generic, not Antigravity's (runner-claude keeps its own, run-once.ts). It
// belongs to runner-core with the kill tree of P1-06 (ADR 0006, amended after P1-09); it lives here until then.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** How to start a program: the absolute CLI (`tribes[].tool.path`), or node + a script (an npm shim, a fake). */
export interface Launch {
  readonly command: string;
  readonly args: readonly string[];
}

export interface ChildOptions {
  readonly cwd?: string;
  readonly env: Readonly<Record<string, string>>;
  /** stderr as it comes, in any chunks: the run's stderr.log (openRunOutput of runner-core). */
  readonly onStderr?: (chunk: string) => void;
}

export interface Exit {
  /** null when the process ended on a signal or never started. */
  readonly code: number | null;
  readonly signal: string | null;
  /** Why it never started (ENOENT, EACCES), if it did not. */
  readonly failure?: string;
}

/** Keep the end of stderr: AGY_ERROR is its last line, and a runaway stream must not fill memory. */
const STDERR_LIMIT = 64 * 1024;
/** POSIX: how long SIGTERM has before SIGKILL. Windows ends the process at once (TerminateProcess). */
const KILL_GRACE_MS = 5_000;

export interface Child {
  readonly pid: number;
  readonly exit: Promise<Exit>;
  /** stderr so far, its last 64 KiB. */
  stderr(): string;
  kill(): void;
}

/** Spawns `launch` + `args` without a shell (ADR 0015), stdin closed, each stdout line handed to `onLine`. */
export function startChild(
  launch: Launch,
  args: readonly string[],
  options: ChildOptions,
  onLine: (line: string) => void,
): Child {
  const child = spawn(launch.command, [...launch.args, ...args], {
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
  const exit = new Promise<Exit>((resolve) => {
    child.once('error', (error) => {
      resolve({ code: null, signal: null, failure: error.message });
    });
    child.once('close', (code, signal) => {
      resolve({ code, signal });
    });
  });
  const kill = (): void => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const late = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
    late.unref();
    void exit.then(() => {
      clearTimeout(late);
    });
  };
  return { pid: child.pid ?? 0, exit, stderr: () => stderr, kill };
}

export interface Ran extends Exit {
  readonly stdout: string;
  readonly stderr: string;
  readonly timed_out: boolean;
}

/** Runs a short command to its end (`--version`, `/usage`): all of stdout, killed after `timeout_ms`. */
export async function runToEnd(
  launch: Launch,
  args: readonly string[],
  options: ChildOptions & { readonly timeout_ms: number },
): Promise<Ran> {
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
