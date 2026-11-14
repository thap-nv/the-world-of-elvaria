// A short call of the CLI that is read once it ends: `--version`, `auth status --json`, `-p "/usage"`, the probe's
// ping. No shell, the env it is given and nothing else (ADR 0013, 0015); stdin closed at once.
import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

import { killTree, noAnswerWithin } from '@elvaria/runner-core';

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

type Child = ChildProcessByStdio<null, Readable, Readable>;

/** The child, or why it could not start: some failures throw at once (a broken executable on Windows: EFTYPE). */
function start(launch: Launch, args: readonly string[], options: RunOnceOptions): Child | Error {
  try {
    return spawn(launch.file, [...launch.args, ...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

export function runOnce(launch: Launch, args: readonly string[], options: RunOnceOptions): Promise<Ran> {
  return new Promise((resolve) => {
    const child = start(launch, args, options);
    if (child instanceof Error) {
      resolve({ code: null, stdout: '', stderr: '', problem: child.message });
      return;
    }
    let stdout = '';
    let stderr = '';
    let problem: string | undefined;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    const timer = setTimeout(() => {
      // The same words as runner-core's runToEnd: how long it had, not a failed sign-in (fix/busy-machine).
      problem = noAnswerWithin(options.timeoutMs);
      // The whole tree (P1-06): a child left holding stdout would keep `close` from ever coming.
      void killTree(child.pid ?? 0);
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
