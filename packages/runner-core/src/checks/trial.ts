// The machine's part of a ritual with a scratch plot (implementation-plan §3.15, ADR 0022; P1-20), run in that plot
// before the judge opens: commands.reset, the territory's checks, again up to `runs` times while every run passes
// (flake_check), then coverage on the branch and on its base (coverage_not_lower). What it gives is checks like any
// other: `rerun_clean` (every reset passed), the first run's checks, `flake_check` and `coverage_not_lower` when they
// ran; the domain decides what flaked and what dropped, and the pass rule turns a failing one into the verdict.
import { FLAKE_CHECK_ID, RERUN_CLEAN_CHECK_ID, flakyChecksOf, rerunDue } from '@elvaria/domain';

import { SETUP_TIMEOUT_MS } from '../plot/setup.ts';
import type { ProcessHost } from '../process/program.ts';
import { coverageCheck } from './coverage.ts';
import { headerOf, openLog, runLines } from './logged-run.ts';
import { checkLogOf, runChecks, withSecrets } from './run-checks.ts';
import type { CheckRun } from './run-checks.ts';
import type { Reset, TrialPlot, TrialRequest } from './trial-types.ts';

export type { Reset, TrialPlot, TrialRequest } from './trial-types.ts';

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
  let failed: number | null | undefined;
  let spent = 0;
  let closed: Promise<CheckRun> | undefined;
  return {
    run: async () => {
      if (lines === undefined) return true;
      await log.write(`\n${headerOf(lines)}\n`);
      const run = await runLines(lines, context, log, SETUP_TIMEOUT_MS);
      spent += run.duration_ms;
      if (run.exit_code !== 0 && failed === undefined) failed = run.exit_code;
      return run.exit_code === 0;
    },
    close: () =>
      (closed ??= log.close().then(() => ({
        id: RERUN_CLEAN_CHECK_ID,
        pass: failed === undefined,
        duration_ms: spent,
        log_path: logPath,
        exit_code: failed === undefined ? 0 : failed,
        timed_out: false,
      }))),
  };
}

/** The runs of the checks: the first, then reruns after a reset while every run passed and more are wanted. */
async function checkRuns(request: TrialRequest, host: ProcessHost, reset: Reset): Promise<CheckRun[][]> {
  const done: CheckRun[][] = [await runChecks(request, host)];
  // No check selected: nothing that could flake.
  const any = (done[0] ?? []).length > 0;
  while (any && rerunDue(done, request.runs) && request.signal?.aborted !== true) {
    if (!(await reset.run())) break;
    done.push(await runChecks({ ...request, run_dir: `${request.run_dir}/run-${done.length + 1}` }, host));
  }
  return done;
}

const mark = (run: CheckRun): string => `${run.pass ? '✓' : '✗'} ${run.id} (${run.log_path})`;

/** `flake_check` once the checks ran more than once: which passed and failed on the same commit, run by run. */
async function flakeCheck(request: TrialRequest, runs: readonly CheckRun[][]): Promise<CheckRun[]> {
  if (runs.length < 2) return [];
  const flaky = flakyChecksOf(runs);
  const logPath = checkLogOf(request.run_dir, FLAKE_CHECK_ID);
  const log = await openLog(
    request.kingdom,
    logPath,
    `elvaria: ${runs.length} runs of the checks on one commit`,
  );
  const said =
    flaky.length === 0
      ? 'every check gave the same result in every run'
      : `flaky: ${flaky.join(', ')} passed in one run and failed in another`;
  await log.write(
    `${runs.map((run, index) => `run ${index + 1}: ${run.map(mark).join(', ')}`).join('\n')}\n${said}\n`,
  );
  await log.close();
  const reruns = runs.slice(1).flat();
  const pass = flaky.length === 0;
  return [
    {
      id: FLAKE_CHECK_ID,
      pass,
      duration_ms: reruns.reduce((sum, run) => sum + run.duration_ms, 0),
      log_path: logPath,
      exit_code: pass ? 0 : 1,
      timed_out: false,
    },
  ];
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
    const coverage = await coverageCheck(request, host, plot, reset);
    return [await reset.close(), ...(runs[0] ?? []), ...flake, ...coverage];
  } finally {
    await reset.close();
  }
}
