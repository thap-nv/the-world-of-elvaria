// run-check: one territory check, pass or fail, with its log (produces: check).
// Params: { check_id }. Context from the Steward: { checks: [{ id, argv, timeout_minutes }], run_dir? }, where
// argv is the check's `run` command already resolved to an executable (npm .cmd shims become `node <js>`,
// implementation-plan §6), so this script spawns without a shell on every OS (ADR 0015). The quest only names
// a check id; the command itself never comes from params, which a model writes.
// Output: { pass, details: { check_id, exit_code, timed_out, duration_ms, log_path } }.
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { childEnv, cli, isObject, text, toPortable, UsageError } from './common.mjs';

const MS_PER_MINUTE = 60_000;

/** @typedef {{ id: string; argv: string[]; timeout_minutes: number }} ResolvedCheck */

/** @param {unknown} value @returns {value is ResolvedCheck} */
const isResolvedCheck = (value) =>
  isObject(value) &&
  typeof value['id'] === 'string' &&
  Array.isArray(value['argv']) &&
  value['argv'].length > 0 &&
  value['argv'].every((part) => typeof part === 'string') &&
  typeof value['timeout_minutes'] === 'number' &&
  value['timeout_minutes'] > 0;

/** @param {import('./common.mjs').Json} context @param {string} checkId @returns {ResolvedCheck} */
function findCheck(context, checkId) {
  const checks = context['checks'];
  if (!Array.isArray(checks) || !checks.every(isResolvedCheck)) {
    throw new UsageError('context.checks must list { id, argv, timeout_minutes } from the territory');
  }
  const check = checks.find((candidate) => candidate.id === checkId);
  if (check === undefined) throw new UsageError(`the territory has no check "${checkId}"`);
  return check;
}

/** `<run_dir>/checks/<id>.log` (implementation-plan §2.2), or null without a run dir. @param {unknown} runDir */
function logFileOf(runDir, /** @type {string} */ checkId) {
  if (typeof runDir !== 'string' || runDir === '') return null;
  const file = path.join(runDir, 'checks', `${checkId}.log`);
  mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

/** @type {import('./common.mjs').ScriptBody} */
export function run(params, context, cwd) {
  const check = findCheck(context, text(params, 'check_id'));
  const [command = '', ...args] = check.argv;
  const logFile = logFileOf(context['run_dir'], check.id);
  // Straight to the log file: a verbose test run would overflow spawnSync's output buffer.
  const output = logFile === null ? 'ignore' : openSync(logFile, 'w');
  const started = performance.now();
  try {
    const result = spawnSync(command, args, {
      cwd,
      env: childEnv(),
      shell: false,
      stdio: ['ignore', output, output],
      timeout: check.timeout_minutes * MS_PER_MINUTE,
      // Only this child stops here; the Steward's own timeout kills the whole tree (implementation-plan §3.4).
      killSignal: 'SIGTERM',
    });
    const timedOut = isTimeout(result.error);
    if (result.error && !timedOut) throw new Error(`cannot start ${command}: ${result.error.message}`);
    return {
      pass: !timedOut && result.status === 0,
      details: {
        check_id: check.id,
        exit_code: result.status,
        timed_out: timedOut,
        duration_ms: Math.round(performance.now() - started),
        log_path: logFile === null ? null : toPortable(logFile),
      },
    };
  } finally {
    if (typeof output === 'number') closeSync(output);
  }
}

/** @param {Error | undefined} error */
const isTimeout = (error) => error !== undefined && 'code' in error && error.code === 'ETIMEDOUT';

if (import.meta.main) await cli(run);
