// The machine checks that run before a judge opens a session (implementation-plan §3.2, ADR 0008): the territory's
// checks whose `when` globs match what the quest touched, one after another in the plot, each with its log in
// `.runs/<quest>-<n>/checks/<id>.log`. The machine is the primary judge, so a check that cannot run (shell syntax,
// program not found, the exclusive lock never freed) fails rather than vanishing from the verdict.
import { performance } from 'node:perf_hooks';

import type { Territory, TerritoryCheck, VerdictCheck } from '@elvaria/domain';
import { acquireLock, inKingdom } from '@elvaria/store';
import type { HeldLock } from '@elvaria/store';

import { openLog, runLine } from './logged-run.ts';
import type { ProcessHost } from '../process/program.ts';
import { selectChecks } from './select-checks.ts';

export const MS_PER_MINUTE = 60_000;
/** A cleanup only clears what a killed check left behind (containers, locks): minutes, not the check's hour. */
export const CLEANUP_TIMEOUT_MS = 5 * MS_PER_MINUTE;
/** Beyond the longest exclusive check: time for a crashed holder's lock to go stale (store STALE_MS). */
const LOCK_MARGIN_MS = MS_PER_MINUTE;

export interface ChecksRequest {
  /** The kingdom root, native: logs and the exclusive lock live there. */
  readonly kingdom: string;
  readonly territory: Pick<Territory, 'id' | 'checks'>;
  /** Paths the quest changed, relative to the plot (PlotManager.touched). */
  readonly touched: readonly string[];
  /** The plot, native: every check runs there. */
  readonly cwd: string;
  /** `.runs/<quest>-<n>` (verifier: `.runs/<quest>-<n>/verify`), portable and relative to the kingdom. */
  readonly run_dir: string;
  /**
   * Aborted when nobody waits for the checks any more (P1-25: they run outside the Steward's tick, and it stopped or
   * the quest moved on): the running check is killed and the rest never start. Their results are not to be used.
   */
  readonly signal?: AbortSignal;
}

export interface ChecksOptions {
  /** How long an exclusive check waits for another quest's; default: the longest exclusive timeout + 1 min. */
  readonly lock_wait_ms?: number;
}

/** One check that ran: what the verdict records (`toVerdictCheck`) plus what the judge's prompt shows. */
export interface CheckRun {
  readonly id: TerritoryCheck['id'];
  readonly pass: boolean;
  readonly duration_ms: number;
  /** Relative to the kingdom: `<run_dir>/checks/<id>.log`. */
  readonly log_path: string;
  /** null when the check timed out or never started. */
  readonly exit_code: number | null;
  readonly timed_out: boolean;
}

/** Portable, relative to the kingdom. */
export const checkLogOf = (runDir: string, id: string): string => `${runDir}/checks/${id}.log`;
/** One lock per territory, shared by every quest on it (`checks[].exclusive`: Docker, e2e). */
export const exclusiveLockOf = (territory: string): string => `.state/checks/${territory}-exclusive`;

export const toVerdictCheck = ({ id, pass, duration_ms, log_path }: CheckRun): VerdictCheck => ({
  id,
  pass,
  duration_ms,
  log_path,
});

/** One check, to its end or its timeout; `cleanup` runs after a timeout (implementation-plan §9.2). */
export async function runCheck(
  check: TerritoryCheck,
  request: ChecksRequest,
  host: ProcessHost,
  timeoutMs: number = check.timeout_minutes * MS_PER_MINUTE,
): Promise<CheckRun> {
  const logPath = checkLogOf(request.run_dir, check.id);
  const log = await openLog(request.kingdom, logPath, `$ ${check.run}`);
  const context = {
    cwd: request.cwd,
    host,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  };
  try {
    const run = await runLine(check.run, context, log, timeoutMs);
    if (run.timed_out && check.cleanup !== undefined) {
      await log.write(`\n$ ${check.cleanup}\n`);
      await runLine(check.cleanup, context, log, CLEANUP_TIMEOUT_MS);
    }
    return {
      id: check.id,
      pass: run.exit_code === 0,
      duration_ms: run.duration_ms,
      log_path: logPath,
      exit_code: run.exit_code,
      timed_out: run.timed_out,
    };
  } finally {
    await log.close();
  }
}

/**
 * The lock, or undefined once `waitMs` has passed or `signal` aborted; each try already waits a little (store's
 * lock retries).
 */
async function holdLock(target: string, waitMs: number, signal?: AbortSignal): Promise<HeldLock | undefined> {
  const deadline = performance.now() + waitMs;
  for (;;) {
    const held = await acquireLock(target, { wait: waitMs > 0 });
    if (held.ok) return held.value;
    if (performance.now() >= deadline || signal?.aborted === true) return undefined;
  }
}

async function runExclusive(
  check: TerritoryCheck,
  request: ChecksRequest,
  host: ProcessHost,
  waitMs: number,
): Promise<CheckRun> {
  const { kingdom, territory } = request;
  const held = await holdLock(inKingdom(kingdom, exclusiveLockOf(territory.id)), waitMs, request.signal);
  if (held !== undefined) {
    try {
      return await runCheck(check, request, host);
    } finally {
      await held.release();
    }
  }
  const logPath = checkLogOf(request.run_dir, check.id);
  const log = await openLog(kingdom, logPath, `$ ${check.run}`);
  await log.write(`elvaria: another quest kept the exclusive checks of ${territory.id} for ${waitMs} ms\n`);
  await log.close();
  return { id: check.id, pass: false, duration_ms: 0, log_path: logPath, exit_code: null, timed_out: false };
}

const exclusiveWaitOf = (checks: readonly TerritoryCheck[]): number =>
  Math.max(0, ...checks.filter((check) => check.exclusive).map((check) => check.timeout_minutes)) *
    MS_PER_MINUTE +
  LOCK_MARGIN_MS;

/**
 * Runs the checks `request.touched` selects, in the territory's order, one at a time; an exclusive one first
 * takes the territory's lock, so two quests never run their Docker or e2e checks at once.
 */
export async function runChecks(
  request: ChecksRequest,
  host: ProcessHost,
  options: ChecksOptions = {},
): Promise<CheckRun[]> {
  const waitMs = options.lock_wait_ms ?? exclusiveWaitOf(request.territory.checks);
  const runs: CheckRun[] = [];
  for (const check of selectChecks(request.territory.checks, request.touched)) {
    if (request.signal?.aborted === true) break;
    runs.push(
      check.exclusive
        ? await runExclusive(check, request, host, waitMs)
        : await runCheck(check, request, host),
    );
  }
  return runs;
}
