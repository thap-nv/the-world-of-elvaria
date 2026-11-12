// A failing check that failed because of its environment (P1-54, (c) of the P1-50 report): the end of its log, read
// here, against the territory's `environment_errors`; the domain decides (environmentLineOf). The log was masked
// with the quest's secrets when it closed (P1-10b), so the line the Steward tells the owner is masked too.
import { Buffer } from 'node:buffer';
import { open } from 'node:fs/promises';

import { environmentLineOf } from '@elvaria/domain';
import { inKingdom } from '@elvaria/store';

/** What withEnvironment reads of a check that ran (run-checks.ts CheckRun), named here so neither imports the other. */
interface EndedRun {
  readonly pass: boolean;
  readonly log_path: string;
  readonly environment?: string;
}

/** How much of a log is read: Docker says why a stack failed at the end of the run, far within this. */
const READ_BYTES = 65_536;

/** The last READ_BYTES of the log at `logPath` (relative to the kingdom); empty when it cannot be read. */
export async function logEndOf(kingdom: string, logPath: string): Promise<string> {
  try {
    const handle = await open(inKingdom(kingdom, logPath), 'r');
    try {
      const { size } = await handle.stat();
      const start = Math.max(0, size - READ_BYTES);
      const buffer = Buffer.alloc(size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return '';
  }
}

/** The last `count` lines of `text`, without the blank end. */
export const lastLinesOf = (text: string, count: number): string =>
  text.replaceAll('\r\n', '\n').trimEnd().split('\n').slice(-count).join('\n');

/**
 * `run` with `environment` set when it failed and the end of its log shows a line one of `patterns` finds; as it was
 * when it passed, already says why, or the territory names no pattern.
 */
export async function withEnvironment<Run extends EndedRun>(
  run: Run,
  kingdom: string,
  patterns: readonly string[] = [],
): Promise<Run> {
  if (run.pass || run.environment !== undefined || patterns.length === 0) return run;
  const line = environmentLineOf(await logEndOf(kingdom, run.log_path), patterns);
  return line === undefined ? run : { ...run, environment: line };
}
