// A command of a build run as a child process (PS-04b): the trial must hear the new build's own code answer, not
// this one's. Its words are fixed by the trial, its env is the minimal one (ADR 0013), its output is kept for the
// owner when it fails.
import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

import { minimalEnv } from '../process/minimal-env.ts';
import { runProcess } from '../process/run-process.ts';
import { cliEntryOf } from './pointer.ts';
import type { CliIo } from '../io.ts';
import type { ProcessOutcome } from '../process/run-process.ts';

const MS_PER_MINUTE = 60_000;

export type BuildCli = (args: readonly string[], minutes: number) => Promise<ProcessOutcome>;

/** `elvaria <args>` on the build at `build`, run to its end. */
export function buildCli(build: string, io: CliIo): BuildCli {
  const env = minimalEnv(io.env);
  return (args, minutes) =>
    runProcess(io.nodePath, [cliEntryOf(build), ...args], {
      cwd: build,
      env,
      timeoutMs: minutes * MS_PER_MINUTE,
    });
}

export type LongChild = ChildProcessByStdio<null, Readable, Readable>;

/** `elvaria <args>` on the build, left running (`run`): the caller stops it. */
export function startBuildCli(build: string, io: CliIo, args: readonly string[]): LongChild {
  return spawn(io.nodePath, [cliEntryOf(build), ...args], {
    cwd: build,
    env: minimalEnv(io.env),
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
