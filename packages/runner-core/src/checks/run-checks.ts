// The machine checks that run before a judge opens a session (implementation-plan §3.2, ADR 0008): the territory's
// checks whose `when` globs match what the quest touched, one after another in the plot, each with its log in
// `.runs/<quest>-<n>/checks/<id>.log`. The machine is the primary judge, so a check that cannot run (shell syntax,
// program not found, the exclusive lock never freed) fails rather than vanishing from the verdict. A failing check
// whose log shows its environment failed (territory.environment_errors) says so (P1-54): its run says nothing of the
// work. The checks that are not exclusive run first, so a check of seconds never waits out the lock (P1-54).
import type { PartyRole, Territory, TerritoryCheck, VerdictCheck } from '@elvaria/domain';

import { withEnvironment } from './environment.ts';
import { exclusiveWaitOf, underExclusiveLock } from './exclusive-lock.ts';
import type { LockScope } from './exclusive-lock.ts';
import { headerOf, openLog, runLine, runLines } from './logged-run.ts';
import type { ProcessHost } from '../process/program.ts';
import { selectChecks } from './select-checks.ts';
import { sessionEnv } from '../treasury/session-env.ts';

export { exclusiveLockOf } from './exclusive-lock.ts';

export const MS_PER_MINUTE = 60_000;
/** A cleanup only clears what a killed check left behind (containers, locks): minutes, not the check's hour. */
export const CLEANUP_TIMEOUT_MS = 5 * MS_PER_MINUTE;

export interface ChecksRequest {
  /** The kingdom root, native: logs and the exclusive lock live there. */
  readonly kingdom: string;
  /** `environment_errors` absent: no failing check is told apart as its environment's (P1-54). */
  readonly territory: Pick<Territory, 'id' | 'checks'> & Partial<Pick<Territory, 'environment_errors'>>;
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
  /**
   * The quest's `secrets_required`, treasury name → value (P1-10b): each check gets them in its env, as the session
   * did, so a check that needs one (a private registry) passes on the machine as it did for the character; their
   * values are masked in the logs. Absent or empty: the minimal env alone.
   */
  readonly secrets?: Readonly<Record<string, string>>;
  /**
   * The quest's `party_role` (P1-18, §3.15): a merge quest runs every check of the territory, a part skips those
   * marked `defer_to_merge`; absent (or a contract) selects by `when` alone.
   */
  readonly party_role?: PartyRole;
  /**
   * How long an exclusive check waits for the territory's lock (the domain's exclusiveWaitMinutes, P1-20): a judge in
   * its scratch plot holds it for its whole session. Absent: the longest exclusive timeout + 1 min.
   */
  readonly lock_wait_ms?: number;
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
  /**
   * The line of its log that shows it failed because of its environment, not the work (P1-54): one of the
   * territory's environment_errors, or the machine's own lockBusyLine. Never on a passing check.
   */
  readonly environment?: string;
}

/** Portable, relative to the kingdom. */
export const checkLogOf = (runDir: string, id: string): string => `${runDir}/checks/${id}.log`;

export const toVerdictCheck = ({ id, pass, duration_ms, log_path }: CheckRun): VerdictCheck => ({
  id,
  pass,
  duration_ms,
  log_path,
});

/** How long a command of `request` waits for the territory's exclusive lock. */
export const lockWaitOf = (request: ChecksRequest, options: ChecksOptions = {}): number =>
  options.lock_wait_ms ?? request.lock_wait_ms ?? exclusiveWaitOf(request.territory.checks);

/** The exclusive lock of the request's territory, waited for `waitMs` or until the request's stop. */
export const lockScopeOf = (request: ChecksRequest, waitMs = lockWaitOf(request)): LockScope => ({
  kingdom: request.kingdom,
  territory: request.territory.id,
  wait_ms: waitMs,
  signal: request.signal,
});

/**
 * The host a territory command runs with (a check, P1-10b; a plot's `commands.setup`, P1-30): the quest's secrets
 * added to the minimal env the way a session gets them (sessionEnv refuses one that would replace a variable of
 * it), and their values, which its log is masked with. No secrets: the host's minimal env alone.
 */
export function withSecrets(
  host: ProcessHost,
  secrets: Readonly<Record<string, string>> = {},
): { host: ProcessHost; known: string[] } {
  const env = sessionEnv({ base: host.env, context: {}, secrets });
  return { host: { ...host, env }, known: Object.values(secrets).filter((value) => value !== '') };
}

/**
 * How runCheck runs one check: whether the caller holds the territory's exclusive lock already (an exclusive check),
 * else how long its cleanup waits for it.
 */
export interface RunCheckOptions {
  readonly locked?: boolean;
  readonly lock_wait_ms?: number;
}

/**
 * The cleanup of a check that timed out (implementation-plan §9.2) clears containers and locks an exclusive check of
 * another quest may stand on, so it runs under the territory's lock (P1-54); one that never gets it is said and left.
 */
async function cleanUp(
  cleanup: string,
  scope: { request: ChecksRequest; options: RunCheckOptions },
  context: Parameters<typeof runLine>[1],
  log: Parameters<typeof runLine>[2],
): Promise<void> {
  const { request, options } = scope;
  await log.write(`\n$ ${cleanup}\n`);
  const clean = () => runLine(cleanup, context, log, CLEANUP_TIMEOUT_MS);
  if (options.locked === true) {
    await clean();
    return;
  }
  const done = await underExclusiveLock(lockScopeOf(request, options.lock_wait_ms), clean);
  if (!done.ok) await log.write(`${done.error}: the cleanup did not run\n`);
}

/** One check, to its end or its timeout; `cleanup` runs after a timeout (implementation-plan §9.2). */
export async function runCheck(
  check: TerritoryCheck,
  request: ChecksRequest,
  host: ProcessHost,
  timeoutMs: number = check.timeout_minutes * MS_PER_MINUTE,
  options: RunCheckOptions = {},
): Promise<CheckRun> {
  const logPath = checkLogOf(request.run_dir, check.id);
  const given = withSecrets(host, request.secrets);
  const log = await openLog(request.kingdom, logPath, headerOf(check.run), given.known);
  const context = {
    cwd: request.cwd,
    host: given.host,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  };
  let ran: CheckRun;
  try {
    // A check of several commands stops at the first that fails, as CI's `&&` (P1-20).
    const run = await runLines(check.run, context, log, timeoutMs);
    if (run.timed_out && check.cleanup !== undefined)
      await cleanUp(check.cleanup, { request, options }, context, log);
    ran = {
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
  // Read once the log is closed, so masked: the line goes to the owner.
  return withEnvironment(ran, request.kingdom, request.territory.environment_errors);
}

async function runExclusive(
  check: TerritoryCheck,
  request: ChecksRequest,
  host: ProcessHost,
  waitMs: number,
): Promise<CheckRun> {
  const scope = lockScopeOf(request, waitMs);
  const timeoutMs = check.timeout_minutes * MS_PER_MINUTE;
  const ran = await underExclusiveLock(scope, () =>
    runCheck(check, request, host, timeoutMs, { locked: true }),
  );
  if (ran.ok) return ran.value;
  const logPath = checkLogOf(request.run_dir, check.id);
  const log = await openLog(request.kingdom, logPath, headerOf(check.run));
  await log.write(`${ran.error}\n`);
  await log.close();
  const run = { id: check.id, pass: false, duration_ms: 0, log_path: logPath, exit_code: null };
  // The machine kept the check from running: no word on the work (P1-54).
  return { ...run, timed_out: false, environment: ran.error };
}

/**
 * Runs the checks `request.touched` selects, one at a time: those that are not exclusive first, in the territory's
 * order, then the exclusive ones, each after it takes the territory's lock, so two quests never run their Docker or
 * e2e checks at once and a short check never stands behind a lock another quest holds (P1-54).
 */
export async function runChecks(
  request: ChecksRequest,
  host: ProcessHost,
  options: ChecksOptions = {},
): Promise<CheckRun[]> {
  const waitMs = lockWaitOf(request, options);
  const selected = selectChecks(request.territory.checks, request.touched, request.party_role);
  const ordered = [
    ...selected.filter((check) => !check.exclusive),
    ...selected.filter((check) => check.exclusive),
  ];
  const runs: CheckRun[] = [];
  for (const check of ordered) {
    if (request.signal?.aborted === true) break;
    runs.push(
      check.exclusive
        ? await runExclusive(check, request, host, waitMs)
        : await runCheck(check, request, host, undefined, { lock_wait_ms: waitMs }),
    );
  }
  return runs;
}
