// The checks of a ritual with a scratch plot (ADR 0022, P1-20) as the Steward asks for them: a fresh scratch plot
// from the quest's branch, commands.setup there, then the trial. A setup that fails is the work's failure to be set
// up clean from its branch (a broken lockfile), so it comes back as a failing `rerun_clean` naming the setup log; a
// plot git cannot make is the machine's trouble, and throws like any check that cannot run. A setup whose log shows its
// environment failed (territory.environment_errors: a registry out of reach) says so, as a check does (P1-54).
import { RERUN_CLEAN_CHECK_ID } from '@elvaria/domain';
import type { PartyRole, Quest, Territory } from '@elvaria/domain';

import type { PlotManager } from '../plot/plot-manager.ts';
import { scratchIdOf } from '../plot/scratch.ts';
import { setupLogOf } from '../plot/setup.ts';
import { withEnvironment } from './environment.ts';
import type { ProcessHost } from '../process/program.ts';
import type { CheckRun } from './run-checks.ts';
import { runTrial } from './trial.ts';

export interface ScratchTrialRequest {
  /** The kingdom root, native. */
  readonly kingdom: string;
  readonly quest: Pick<Quest, 'id'>;
  readonly territory: Territory;
  /** `.runs/<quest>-<n>`, portable and relative to the kingdom. */
  readonly run_dir: string;
  /** Runs of the checks on one commit: FLAKE_RUNS under flake_check, else 1. */
  readonly runs: number;
  /** The ritual has coverage_not_lower. */
  readonly coverage: boolean;
  readonly signal?: AbortSignal;
  readonly secrets?: Readonly<Record<string, string>>;
  readonly party_role?: PartyRole;
  /** How long an exclusive check waits for the territory's lock (ChecksRequest.lock_wait_ms). */
  readonly lock_wait_ms?: number;
}

export async function trialInScratch(
  manager: PlotManager,
  request: ScratchTrialRequest,
  host: ProcessHost,
): Promise<CheckRun[]> {
  const { quest, territory, secrets, signal } = request;
  // The Steward that stops kills the setup too (P1-49): what the trial gives then is thrown away (background.ts).
  const prepared = await manager.prepareScratch(quest, territory, {
    ...(secrets === undefined ? {} : { secrets }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!prepared.ok) {
    const { reason, detail, log_path: logPath } = prepared.error;
    if (reason !== 'setup_failed')
      throw new Error(`the scratch plot of ${quest.id} is not ready (${reason}): ${detail}`);
    const log = logPath ?? setupLogOf(scratchIdOf(quest.id));
    const failed = { id: RERUN_CLEAN_CHECK_ID, pass: false, duration_ms: 0, log_path: log, exit_code: null };
    return [
      await withEnvironment({ ...failed, timed_out: false }, request.kingdom, territory.environment_errors),
    ];
  }
  const scratch = prepared.value;
  const touched = await manager.touched(scratch.plot);
  const plot = {
    base: scratch.base,
    head: scratch.head,
    checkout: (ref: string) => manager.checkoutScratch(scratch, ref),
  };
  const optional = {
    ...(signal === undefined ? {} : { signal }),
    ...(secrets === undefined ? {} : { secrets }),
    ...(request.party_role === undefined ? {} : { party_role: request.party_role }),
    ...(request.lock_wait_ms === undefined ? {} : { lock_wait_ms: request.lock_wait_ms }),
  };
  const { kingdom, run_dir: runDir, runs, coverage } = request;
  const trial = { kingdom, territory, touched, cwd: scratch.worktree, run_dir: runDir, runs, coverage };
  return runTrial({ ...trial, ...optional }, host, plot);
}
