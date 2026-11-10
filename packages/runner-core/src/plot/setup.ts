// `commands.setup` runs once per worktree plot (implementation-plan §3.3: `pnpm install` against the global store),
// and again on the next prepare only while it has not succeeded, so a setup killed halfway is not taken as done.
// It gets the quest's secrets the way its checks do (P1-30, §3.9): an install from a private registry needs the
// token the session would get, and its log loses their values when it closes. The caller's signal kills it (P1-49,
// (a) of P1-47): a Steward stopped with Ctrl+C no longer waits up to SETUP_TIMEOUT_MS for an install.
import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

import { openLog, runLine } from '../checks/logged-run.ts';
import type { ProcessHost } from '../process/program.ts';
import { MS_PER_MINUTE, withSecrets } from '../checks/run-checks.ts';
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
  /**
   * The quest's `secrets_required`, treasury name → value (P1-30): added to the host's minimal env with sessionEnv
   * (no `ELVARIA_*`: setup is not a session) and masked in the setup's log. Absent or empty: the minimal env alone.
   */
  readonly secrets?: Readonly<Record<string, string>>;
  /**
   * Aborted when nobody waits for the plot any more (the Steward stops, P1-49): the setup's tree is killed and the
   * plot stays not set up, so the next prepare runs it again.
   */
  readonly signal?: AbortSignal;
}

/** How a setup that did not succeed ended, for its PlotFailure. */
function endOf(run: { exit_code: number | null; timed_out: boolean }, signal?: AbortSignal): string {
  if (run.timed_out) return 'timed out';
  if (signal?.aborted === true) return 'stopped before its end';
  return `ended with ${run.exit_code ?? 'no exit code'}`;
}

/** null when the territory has no setup or it already succeeded in this worktree. */
export async function runSetup(input: SetupInput): Promise<Result<SetupRun | null, PlotFailure>> {
  const { command, record, signal } = input;
  if (command === undefined || record.setup_done) return ok(null);
  const logPath = setupLogOf(input.quest_id);
  const given = withSecrets(input.host, input.secrets);
  const log = await openLog(input.kingdom, logPath, `$ ${command}`, given.known);
  const context = { cwd: input.worktree, host: given.host, ...(signal === undefined ? {} : { signal }) };
  const run = await runLine(command, context, log, SETUP_TIMEOUT_MS).finally(() => log.close());
  if (run.exit_code !== 0 || signal?.aborted === true) {
    return err({ reason: 'setup_failed', detail: `${command}: ${endOf(run, signal)}`, log_path: logPath });
  }
  await writePlotRecord(input.git_dir, { ...record, setup_done: true });
  return ok({ exit_code: run.exit_code, timed_out: false, duration_ms: run.duration_ms, log_path: logPath });
}
