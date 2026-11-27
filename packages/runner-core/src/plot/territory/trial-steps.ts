// What a territory's trial runs in its plot (plot/territory-trial.ts): commands.setup the way a quest plot runs it
// (one log, SETUP_TIMEOUT_MS), then the checks the way the Steward runs them (runChecks), each failure with what its
// log says. Apart from the making of the plot so that the delivery train (CM-08, train/) runs them in its own order:
// its merges before setup, its generators between setup and the checks.
import { commandLinesOf } from '@elvaria/domain';
import type { Territory, TrialCheck, TrialStep } from '@elvaria/domain';

import { withEnvironment } from '../../checks/environment.ts';
import { openLog, runLine } from '../../checks/logged-run.ts';
import { runChecks } from '../../checks/run-checks.ts';
import type { CheckRun, ChecksRequest } from '../../checks/run-checks.ts';
import type { ProcessHost } from '../../process/program.ts';
import { SETUP_TIMEOUT_MS, setupLogOf } from '../setup.ts';
import { failureInLogFile } from '../trial-log.ts';

export interface TrialStepsRequest {
  /** The kingdom root, native: the logs and the exclusive lock live there. */
  readonly kingdom: string;
  readonly territory: Territory;
  readonly host: ProcessHost;
  /** Kills the running command and starts no other (Ctrl+C); the worktree still goes. */
  readonly signal?: AbortSignal;
  /** The plot's id in the kingdom's `.runs/`: the logs are `.runs/<name>/…`, written over at each run. */
  readonly name: string;
  /** (CM-04) Only these checks of the territory, by id; every one when absent. */
  readonly checks?: readonly string[];
  /**
   * (CM-07) A narrow run (the guest entry's try): the checks the paths `touched` since `base` select, each its narrow
   * command where it has one, `base` as ELVARIA_CHECK_BASE. Absent: every check, its `run`, as a merge quest runs them.
   */
  readonly narrow?: { readonly touched: readonly string[]; readonly base: string };
  /** (RC-04, ADR 0035) The checks the Steward carries instead of running (runChecks' `carried`). */
  readonly carried?: ChecksRequest['carried'];
}

/** What ran in the plot: commands.setup (null when the territory has none), then the checks. */
export interface TrialSteps {
  readonly setup: TrialStep | null;
  readonly checks: TrialCheck[];
}

/** What a failed command's log says, over what the step knew of itself. */
async function withLog<Step extends TrialStep>(kingdom: string, step: Step): Promise<Step> {
  if (step.pass) return step;
  const told = await failureInLogFile(kingdom, step.log_path);
  return {
    ...step,
    ...(told.command === undefined ? {} : { command: told.command }),
    ...(told.line === undefined ? {} : { error_line: told.line }),
  };
}

/** commands.setup in the plot: the log and timeout of a quest plot's setup (setup.ts), no secrets. */
export async function setupStep(request: TrialStepsRequest, worktree: string): Promise<TrialStep | null> {
  const { kingdom, territory, host, signal } = request;
  const command = territory.commands.setup;
  if (command === undefined) return null;
  const logPath = setupLogOf(request.name);
  const log = await openLog(kingdom, logPath, `$ ${command}`);
  const context = { cwd: worktree, host, ...(signal === undefined ? {} : { signal }) };
  const run = await runLine(command, context, log, SETUP_TIMEOUT_MS).finally(() => log.close());
  const pass = run.exit_code === 0 && signal?.aborted !== true;
  const step = {
    command,
    pass,
    duration_ms: run.duration_ms,
    timed_out: run.timed_out,
    exit_code: run.exit_code,
  };
  const known = await withEnvironment({ ...step, log_path: logPath }, kingdom, territory.environment_errors);
  return withLog(kingdom, known);
}

async function checkStep(kingdom: string, territory: Territory, run: CheckRun): Promise<TrialCheck> {
  const check = territory.checks.find(({ id }) => id === run.id);
  const lines = check === undefined ? [] : commandLinesOf(check.run);
  const step: TrialCheck = {
    id: run.id,
    timeout_minutes: check?.timeout_minutes ?? 0,
    command: lines.at(-1) ?? '',
    pass: run.pass,
    duration_ms: run.duration_ms,
    timed_out: run.timed_out,
    exit_code: run.exit_code,
    log_path: run.log_path,
    ...(run.environment === undefined ? {} : { environment: run.environment }),
    ...(run.carried_from === undefined ? {} : { carried_from: run.carried_from }),
  };
  return withLog(kingdom, step);
}

/** The territory's checks in the plot: those of `checks` only when given, narrow when asked. */
export async function checksIn(request: TrialStepsRequest, worktree: string): Promise<TrialCheck[]> {
  const { kingdom, host, signal } = request;
  const only = request.checks;
  const territory =
    only === undefined
      ? request.territory
      : { ...request.territory, checks: request.territory.checks.filter(({ id }) => only.includes(id)) };
  // A party's merge quest runs every check whatever it touched (select-checks.ts): so does the trial, unless narrow.
  const { narrow, carried } = request;
  const selection =
    narrow === undefined
      ? ({ touched: [], party_role: 'merge' } as const)
      : ({ touched: narrow.touched, mode: 'narrow', base: narrow.base } as const);
  const runs = await runChecks(
    {
      kingdom,
      territory,
      ...selection,
      cwd: worktree,
      run_dir: `.runs/${request.name}`,
      ...(signal === undefined ? {} : { signal }),
      ...(carried === undefined ? {} : { carried }),
    },
    host,
  );
  return Promise.all(runs.map((run) => checkStep(kingdom, territory, run)));
}

/** Setup, then the checks unless the setup failed. */
export async function stepsIn(request: TrialStepsRequest, worktree: string): Promise<TrialSteps> {
  const setup = await setupStep(request, worktree);
  if (setup !== null && !setup.pass) return { setup, checks: [] };
  return { setup, checks: await checksIn(request, worktree) };
}
