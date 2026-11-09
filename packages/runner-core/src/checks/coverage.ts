// `coverage_not_lower` (implementation-plan §3.15, ADR 0022; P1-20): commands.coverage on the quest's branch, then on
// the commit it forked from, in the scratch plot, each after commands.reset; both leave an istanbul json-summary that
// the domain compares. The branch must be measurable; a base that is not leaves nothing to fall below.
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { COVERAGE_CHECK_ID, coverageDropsOf, coverageTotalsOf } from '@elvaria/domain';
import type { CommandLines, CoverageTotals } from '@elvaria/domain';
import type { FileHandle } from 'node:fs/promises';

import type { ProcessHost } from '../process/program.ts';
import { headerOf, openLog, runLines } from './logged-run.ts';
import { MS_PER_MINUTE, checkLogOf, withSecrets } from './run-checks.ts';
import type { CheckRun } from './run-checks.ts';
import type { Reset, TrialPlot, TrialRequest } from './trial-types.ts';

/** Where the istanbul json-summary reporter writes, relative to the plot (vitest, jest, c8 and nyc alike). */
export const COVERAGE_SUMMARY = 'coverage/coverage-summary.json';
/** A whole test suite with coverage on; the territory gives no timeout of its own for it. */
export const COVERAGE_TIMEOUT_MS = 60 * MS_PER_MINUTE;
const PCT_DIGITS = 2;

interface Measured {
  readonly totals: CoverageTotals | undefined;
  readonly duration_ms: number;
  /** Why there are no totals. */
  readonly why?: string;
}

interface Measure {
  readonly request: TrialRequest;
  readonly host: ProcessHost;
  readonly command: CommandLines;
  readonly log: FileHandle;
  readonly reset: Reset;
}

/** The totals the command leaves; a summary is read even when the command failed (a threshold missed). */
async function measure(given: Measure, label: string): Promise<Measured> {
  const { request, log } = given;
  const summary = path.join(request.cwd, ...COVERAGE_SUMMARY.split('/'));
  await rm(summary, { force: true });
  await given.reset.run();
  await log.write(`\nelvaria: on ${label}\n${headerOf(given.command)}\n`);
  const context = {
    cwd: request.cwd,
    host: given.host,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  };
  const run = await runLines(given.command, context, log, COVERAGE_TIMEOUT_MS);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(summary, 'utf8'));
  } catch {
    const why = `no readable ${COVERAGE_SUMMARY} (the command ended with ${run.exit_code ?? 'no exit code'})`;
    return { totals: undefined, duration_ms: run.duration_ms, why };
  }
  const totals = coverageTotalsOf(parsed);
  return totals.ok
    ? { totals: totals.value, duration_ms: run.duration_ms }
    : { totals: undefined, duration_ms: run.duration_ms, why: `${COVERAGE_SUMMARY} has no totals` };
}

/** What the comparison says, and whether the check passes. */
function verdictOf(head: Measured, base: Measured): { pass: boolean; said: string } {
  if (head.totals === undefined) return { pass: false, said: `the branch: ${head.why ?? ''}` };
  if (base.totals === undefined)
    return { pass: true, said: `the base: ${base.why ?? ''}; nothing to compare` };
  const drops = coverageDropsOf(head.totals, base.totals);
  if (drops.length === 0) return { pass: true, said: 'coverage did not drop' };
  const lines = drops.map(
    (drop) =>
      `${drop.metric}: ${drop.head_pct.toFixed(PCT_DIGITS)} % < ${drop.base_pct.toFixed(PCT_DIGITS)} %`,
  );
  return { pass: false, said: `coverage dropped against the base:\n${lines.join('\n')}` };
}

/** `coverage_not_lower`, or nothing when the ritual has no such step or the territory measures no coverage. */
export async function coverageCheck(
  request: TrialRequest,
  host: ProcessHost,
  plot: TrialPlot,
  reset: Reset,
): Promise<CheckRun[]> {
  const command = request.territory.commands.coverage;
  if (!request.coverage || command === undefined) return [];
  const logPath = checkLogOf(request.run_dir, COVERAGE_CHECK_ID);
  const given = withSecrets(host, request.secrets);
  const first = `elvaria: coverage of the branch (${plot.head}) against its base (${plot.base})`;
  const log = await openLog(request.kingdom, logPath, first, given.known);
  try {
    const step = { request, host: given.host, command, log, reset };
    const head = await measure(step, 'the branch');
    let base: Measured;
    try {
      await plot.checkout(plot.base);
      base = await measure(step, 'the base');
    } finally {
      // The judge reads and breaks the branch, never its base.
      await plot.checkout(plot.head);
    }
    const { pass, said } = verdictOf(head, base);
    await log.write(`\nelvaria: ${said}\n`);
    const duration = head.duration_ms + base.duration_ms;
    const run = { id: COVERAGE_CHECK_ID, pass, duration_ms: duration, log_path: logPath };
    return [{ ...run, exit_code: pass ? 0 : 1, timed_out: false }];
  } finally {
    await log.close();
  }
}
