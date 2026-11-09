// A territory command run with its output in a log under the kingdom: the checks (`.runs/<quest>-<n>/checks/`)
// and a plot's `commands.setup`. The log says why when the command could not start, since the person reading it
// has nothing else to go on.
import { mkdir, open, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { commandLinesOf } from '@elvaria/domain';
import type { CommandLines } from '@elvaria/domain';
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

/**
 * A new log at `logPath` (portable, relative to the kingdom), opened for appending after `firstLine`; masked on
 * close with `known`, the secret values the command was given, then the patterns.
 */
export async function openLog(
  kingdom: string,
  logPath: string,
  firstLine: string,
  known: readonly string[] = [],
): Promise<FileHandle> {
  const file = inKingdom(kingdom, logPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${firstLine}\n`);
  // Appending: the child writes through the same file, and every write lands after the last one.
  return maskedOnClose(await open(file, 'a'), file, known);
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

/** `$ <first command>`: the line a log of `lines` opens with (openLog's `firstLine`). */
export const headerOf = (lines: CommandLines): string => `$ ${commandLinesOf(lines)[0] ?? ''}`;

/**
 * Runs the commands of `lines` one after another, as CI's `a && b` does without a shell (P1-20): each after the
 * first gets its own `$` line in the log, the first that fails ends the run, and the commands share `timeoutMs`.
 */
export async function runLines(
  lines: CommandLines,
  context: LineContext,
  log: FileHandle,
  timeoutMs: number,
): Promise<ProgramRun> {
  let run = NOT_RUN;
  let spent = 0;
  for (const [index, line] of commandLinesOf(lines).entries()) {
    if (index > 0) await log.write(`\n$ ${line}\n`);
    run = await runLine(line, context, log, Math.max(timeoutMs - spent, 1));
    spent += run.duration_ms;
    if (run.exit_code !== 0 || run.timed_out || context.signal?.aborted === true) break;
  }
  return { ...run, duration_ms: spent };
}
