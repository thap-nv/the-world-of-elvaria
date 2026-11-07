// A short call of the CLI that is read once it ends: `--version`, `auth status --json`, `-p "/usage"`, the probe's
// ping. No shell, the env it is given and nothing else (ADR 0013, 0015); stdin closed at once.
import { spawn } from 'node:child_process';

import type { Launch } from './launch.ts';

export interface Ran {
  /** null when it timed out, was killed, or could not start. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Why it did not run to its end: a start error or the timeout. */
  readonly problem?: string;
}

export interface RunOnceOptions {
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly timeoutMs: number;
}

export function runOnce(launch: Launch, args: readonly string[], options: RunOnceOptions): Promise<Ran> {
  return new Promise((resolve) => {
    const child = spawn(launch.file, [...launch.args, ...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let problem: string | undefined;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    const timer = setTimeout(() => {
      problem = `no answer within ${options.timeoutMs} ms`;
      child.kill();
    }, options.timeoutMs);
    child.on('error', (error) => {
      problem = error.message;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: problem === undefined ? code : null,
        stdout,
        stderr,
        ...(problem === undefined ? {} : { problem }),
      });
    });
  });
}
