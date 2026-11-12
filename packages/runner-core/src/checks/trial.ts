// The machine's part of a ritual with a scratch plot (implementation-plan §3.15, ADR 0022; P1-20), run in that plot
// before the judge opens: commands.reset, the territory's checks, again up to `runs` times while every run passes
// (flake_check), then coverage on the branch and on its base (coverage_not_lower). What it gives is checks like any
// other: `rerun_clean` (every reset passed), the first run's checks, `flake_check` and `coverage_not_lower` when they
// ran; the domain decides what flaked and what dropped, and the pass rule turns a failing one into the verdict.
// (P1-54, (c) and (f) of the P1-50 report) Each reset holds the territory's exclusive lock, so it never pulls down
// what another quest's exclusive check runs on; the reruns run only the checks that may flake (flake-reruns.ts); a
// rerun that failed because of its environment is no flake, and flake_check says so instead of naming one; its log
// ends with the end of each failing rerun's log, which the judge reads.
import { access } from 'node:fs/promises';
import path from 'node:path';

import { FLAKE_CHECK_ID, RERUN_CLEAN_CHECK_ID, flakyChecksOf, rerunDue } from '@elvaria/domain';

import { SETUP_TIMEOUT_MS } from '../plot/setup.ts';
import type { ProcessHost } from '../process/program.ts';
import { coverageCheck } from './coverage.ts';
import { lastLinesOf, logEndOf, withEnvironment } from './environment.ts';
import { underExclusiveLock } from './exclusive-lock.ts';
import { flakeRerunsOf } from './flake-reruns.ts';
import { headerOf, openLog, runLines } from './logged-run.ts';
import { checkLogOf, lockScopeOf, runChecks, withSecrets } from './run-checks.ts';
import type { CheckRun } from './run-checks.ts';
import { selectChecks } from './select-checks.ts';
import type { Reset, TrialPlot, TrialRequest } from './trial-types.ts';

export type { Reset, TrialPlot, TrialRequest } from './trial-types.ts';

/** Lines of each failing rerun's log at the end of the flake_check log: the judge reads why (P1-54, Q7 of P1-50). */
const RERUN_TAIL_LINES = 15;

/** How the resets went: the first failure's exit code, and the line when the environment kept it from running. */
interface ResetFailure {
  readonly exit_code: number | null;
  readonly environment?: string;
}

async function openReset(request: TrialRequest, host: ProcessHost): Promise<Reset> {
  const lines = request.territory.commands.reset;
  const logPath = checkLogOf(request.run_dir, RERUN_CLEAN_CHECK_ID);
  const given = withSecrets(host, request.secrets);
  const first = `elvaria: the checks run in a scratch plot made fresh from the quest's branch (${request.cwd})`;
  const log = await openLog(request.kingdom, logPath, first, given.known);
  if (lines === undefined) await log.write('elvaria: the territory has no commands.reset\n');
  const context = {
    cwd: request.cwd,
    host: given.host,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  };
  const scope = lockScopeOf(request);
  let failed: ResetFailure | undefined;
  let spent = 0;
  let closed: Promise<CheckRun> | undefined;
  const close = async (): Promise<CheckRun> => {
    await log.close();
    const run = { id: RERUN_CLEAN_CHECK_ID, duration_ms: spent, log_path: logPath, timed_out: false };
    const outcome = failed === undefined ? { pass: true, exit_code: 0 } : { ...failed, pass: false };
    return withEnvironment({ ...run, ...outcome }, request.kingdom, request.territory.environment_errors);
  };
  return {
    run: async () => {
      if (lines === undefined) return true;
      await log.write(`\n${headerOf(lines)}\n`);
      const locked = await underExclusiveLock(scope, () => runLines(lines, context, log, SETUP_TIMEOUT_MS));
      if (!locked.ok) {
        await log.write(`${locked.error}\n`);
        failed ??= { exit_code: null, environment: locked.error };
        return false;
      }
      spent += locked.value.duration_ms;
      if (locked.value.exit_code !== 0) failed ??= { exit_code: locked.value.exit_code };
      return locked.value.exit_code === 0;
    },
    close: () => (closed ??= close()),
  };
}

/** The paths the quest touched that are still in the plot: a deleted spec is no file to run again. */
async function presentIn(cwd: string, touched: readonly string[]): Promise<string[]> {
  const found = await Promise.all(
    touched.map((file) =>
      access(path.join(cwd, file)).then(
        () => file,
        () => undefined,
      ),
    ),
  );
  return found.filter((file) => file !== undefined);
}

/** The runs of the checks: the first, then reruns after a reset while every run passed and more are wanted. */
async function checkRuns(request: TrialRequest, host: ProcessHost, reset: Reset): Promise<CheckRun[][]> {
  const done: CheckRun[][] = [await runChecks(request, host)];
  // No check selected: nothing that could flake.
  if ((done[0] ?? []).length === 0 || !rerunDue(done, request.runs)) return done;
  const reruns = flakeRerunsOf(request.territory.checks, await presentIn(request.cwd, request.touched));
  const territory = { ...request.territory, checks: reruns };
  // None of the checks that may flake ran: nothing to run again.
  if (selectChecks(reruns, request.touched, request.party_role).length === 0) return done;
  while (rerunDue(done, request.runs) && request.signal?.aborted !== true) {
    if (!(await reset.run())) break;
    const runDir = `${request.run_dir}/run-${done.length + 1}`;
    done.push(await runChecks({ ...request, territory, run_dir: runDir }, host));
  }
  return done;
}

const mark = (run: CheckRun): string => `${run.pass ? '✓' : '✗'} ${run.id} (${run.log_path})`;

/** What the flake_check log says after the runs: the flake, or the environment that failed a rerun, or neither. */
function verdictOf(flaky: readonly string[], gone: CheckRun | undefined): string {
  if (flaky.length > 0) return `flaky: ${flaky.join(', ')} passed in one run and failed in another`;
  if (gone === undefined) return 'every check gave the same result in every run';
  return `${gone.id} failed because of its environment (${gone.environment ?? ''}): no flake can be told from that run`;
}

/** `flake_check` once the checks ran more than once: which passed and failed on the same commit, run by run. */
async function flakeCheck(request: TrialRequest, runs: readonly CheckRun[][]): Promise<CheckRun[]> {
  if (runs.length < 2) return [];
  const flaky = flakyChecksOf(runs);
  const reruns = runs.slice(1).flat();
  const gone = reruns.find(({ pass, environment }) => !pass && environment !== undefined);
  const logPath = checkLogOf(request.run_dir, FLAKE_CHECK_ID);
  const log = await openLog(
    request.kingdom,
    logPath,
    `elvaria: ${runs.length} runs of the checks on one commit`,
  );
  const lines = runs.map((run, index) => `run ${index + 1}: ${run.map(mark).join(', ')}`);
  await log.write(`${lines.join('\n')}\n${verdictOf(flaky, gone)}\n`);
  for (const failed of reruns.filter(({ pass }) => !pass)) {
    const end = lastLinesOf(await logEndOf(request.kingdom, failed.log_path), RERUN_TAIL_LINES);
    await log.write(`\n--- the end of ${failed.log_path} ---\n${end}\n`);
  }
  await log.close();
  const pass = flaky.length === 0 && gone === undefined;
  // A flake found stands; a rerun its environment failed, with no flake beside it, says nothing of the work.
  const environment =
    flaky.length === 0 && gone?.environment !== undefined ? { environment: gone.environment } : {};
  const run = { id: FLAKE_CHECK_ID, pass, log_path: logPath, exit_code: pass ? 0 : 1, timed_out: false };
  return [{ ...run, duration_ms: reruns.reduce((sum, { duration_ms: ms }) => sum + ms, 0), ...environment }];
}

/** The machine's part of the ritual in `plot`, whose folder is `request.cwd`; left on the head of the branch. */
export async function runTrial(
  request: TrialRequest,
  host: ProcessHost,
  plot: TrialPlot,
): Promise<CheckRun[]> {
  const reset = await openReset(request, host);
  try {
    if (!(await reset.run())) return [await reset.close()];
    const runs = await checkRuns(request, host, reset);
    const flake = await flakeCheck(request, runs);
    const patterns = request.territory.environment_errors;
    const coverage = await Promise.all(
      (await coverageCheck(request, host, plot, reset)).map((run) =>
        withEnvironment(run, request.kingdom, patterns),
      ),
    );
    return [await reset.close(), ...(runs[0] ?? []), ...flake, ...coverage];
  } finally {
    await reset.close();
  }
}
