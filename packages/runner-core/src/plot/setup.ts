// `commands.setup` runs once per worktree plot (implementation-plan §3.3: `pnpm install` against the global store),
// and again on the next prepare only while it has not succeeded, so a setup killed halfway is not taken as done.
import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

import { openLog, runLine } from '../checks/logged-run.ts';
import type { ProcessHost } from '../checks/program.ts';
import { MS_PER_MINUTE } from '../checks/run-checks.ts';
import { writePlotRecord } from './plot-record.ts';
import type { PlotRecord } from './plot-record.ts';
import type { PlotFailure } from './worktree.ts';

/** The territory has no setup timeout of its own; a cold `pnpm install` of a large repo fits in this. */
export const SETUP_TIMEOUT_MS = 30 * MS_PER_MINUTE;

/** Portable, relative to the kingdom; beside the attempts' run folders, since setup belongs to none of them. */
export const setupLogOf = (questId: string): string => `.runs/${questId}-setup.log`;

export interface SetupRun {
  readonly exit_code: number | null;
  readonly timed_out: boolean;
  readonly duration_ms: number;
  readonly log_path: string;
}

export interface SetupInput {
  readonly kingdom: string;
  readonly quest_id: string;
  readonly worktree: string;
  readonly git_dir: string;
  readonly record: PlotRecord;
  readonly command: string | undefined;
  readonly host: ProcessHost;
}

/** null when the territory has no setup or it already succeeded in this worktree. */
export async function runSetup(input: SetupInput): Promise<Result<SetupRun | null, PlotFailure>> {
  const { command, record } = input;
  if (command === undefined || record.setup_done) return ok(null);
  const logPath = setupLogOf(input.quest_id);
  const log = await openLog(input.kingdom, logPath, `$ ${command}`);
  const run = await runLine(
    command,
    { cwd: input.worktree, host: input.host },
    log,
    SETUP_TIMEOUT_MS,
  ).finally(() => log.close());
  if (run.exit_code !== 0) {
    const ended = run.timed_out ? 'timed out' : `ended with ${run.exit_code ?? 'no exit code'}`;
    return err({ reason: 'setup_failed', detail: `${command}: ${ended}`, log_path: logPath });
  }
  await writePlotRecord(input.git_dir, { ...record, setup_done: true });
  return ok({ exit_code: run.exit_code, timed_out: false, duration_ms: run.duration_ms, log_path: logPath });
}
