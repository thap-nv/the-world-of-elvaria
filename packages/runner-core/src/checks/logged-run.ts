// A territory command run with its output in a log under the kingdom: the checks (`.runs/<quest>-<n>/checks/`)
// and a plot's `commands.setup`. The log says why when the command could not start, since the person reading it
// has nothing else to go on.
import { mkdir, open, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { inKingdom } from '@elvaria/store';

import { maskedOnClose } from './masked-log.ts';
import { runProgram } from '../process/program.ts';
import { argvOf } from './argv.ts';
import type { ProcessHost, ProgramRun } from '../process/program.ts';

export interface LineContext {
  /** Where the command runs: the plot, native. */
  readonly cwd: string;
  readonly host: ProcessHost;
  /** Aborted when nobody waits for the command any more (the Steward stops, P1-25): it is killed. */
  readonly signal?: AbortSignal;
}

const NOT_RUN: ProgramRun = { exit_code: null, timed_out: false, duration_ms: 0, stdout: '', stderr: '' };

/** A new log at `logPath` (portable, relative to the kingdom), opened for appending after `firstLine`. */
export async function openLog(kingdom: string, logPath: string, firstLine: string): Promise<FileHandle> {
  const file = inKingdom(kingdom, logPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${firstLine}\n`);
  // Appending: the child writes through the same file, and every write lands after the last one.
  return maskedOnClose(await open(file, 'a'), file);
}

/** Runs `line` with its output appended to `log`; a line that cannot start says why in the log. */
export async function runLine(
  line: string,
  context: LineContext,
  log: FileHandle,
  timeoutMs: number,
): Promise<ProgramRun> {
  const argv = await argvOf(line, context.host.resolve);
  if (!argv.ok) {
    await log.write(`elvaria: cannot run this command (${argv.error.reason}: ${argv.error.detail})\n`);
    return NOT_RUN;
  }
  const run = await runProgram(argv.value, {
    cwd: context.cwd,
    env: context.host.env,
    timeout_ms: timeoutMs,
    output: log.fd,
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
  if (run.start_error !== undefined) await log.write(`elvaria: cannot start: ${run.start_error}\n`);
  if (run.timed_out) await log.write(`\nelvaria: stopped after ${timeoutMs} ms\n`);
  else if (context.signal?.aborted === true) await log.write('\nelvaria: stopped before its end\n');
  return run;
}
