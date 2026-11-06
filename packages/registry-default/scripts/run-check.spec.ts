import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { UsageError } from './common.mjs';
import { run } from './run-check.mjs';
import { makePlot, runScript } from './test-plot.ts';
import type { Plot } from './test-plot.ts';

let plot: Plot | undefined;
afterEach(() => plot?.remove());

/** A check the Steward has already resolved to `node -e <code>`: the same on every OS. */
const nodeCheck = (id: string, code: string, timeoutMinutes = 1) => ({
  id,
  argv: [process.execPath, '-e', code],
  timeout_minutes: timeoutMinutes,
});

interface CheckResult {
  pass: boolean;
  details: {
    check_id: string;
    exit_code: number | null;
    timed_out: boolean;
    duration_ms: number;
    log_path: string | null;
  };
}

describe('run-check', () => {
  const checks = [
    nodeCheck('unit', "console.log('12 passed'); console.error('a warning')"),
    nodeCheck('lint', "console.error('2 problems'); process.exit(3)"),
    // 6 ms: far below the child's 30 s sleep, so the timeout fires first.
    nodeCheck('e2e', 'setTimeout(() => {}, 30000)', 0.0001),
  ];

  it('passes a check that exits 0 and writes its output to <run_dir>/checks/<id>.log', () => {
    plot = makePlot();
    const runDir = path.join(plot.dir, '.runs', 'q-1');
    const result = run({ check_id: 'unit' }, { checks, run_dir: runDir }, plot.dir) as CheckResult;
    expect(result.pass).toBe(true);
    expect(result.details).toMatchObject({ check_id: 'unit', exit_code: 0, timed_out: false });
    expect(result.details.log_path).toBe(path.join(runDir, 'checks', 'unit.log').split(path.sep).join('/'));
    const log = readFileSync(path.join(runDir, 'checks', 'unit.log'), 'utf8');
    expect(log).toContain('12 passed');
    expect(log).toContain('a warning');
  });

  it('fails a check that exits non-zero, and keeps no log without a run dir', () => {
    plot = makePlot();
    const result = run({ check_id: 'lint' }, { checks }, plot.dir) as CheckResult;
    expect(result).toMatchObject({
      pass: false,
      details: { exit_code: 3, timed_out: false, log_path: null },
    });
  });

  it('fails a check that runs past its timeout', () => {
    plot = makePlot();
    const result = run({ check_id: 'e2e' }, { checks }, plot.dir) as CheckResult;
    expect(result).toMatchObject({ pass: false, details: { timed_out: true } });
  });

  it.each([
    [{ check_id: 'deploy' }, { checks }, 'no check "deploy"'],
    [{}, { checks }, 'params.check_id'],
    [{ check_id: 'unit' }, {}, 'context.checks'],
    [
      { check_id: 'unit' },
      { checks: [{ id: 'unit', argv: 'pnpm test', timeout_minutes: 1 }] },
      'context.checks',
    ],
  ])('refuses params %j with context %j', (params, context, message) => {
    expect(() => run(params, context, '.')).toThrow(UsageError);
    expect(() => run(params, context, '.')).toThrow(message);
  });

  it('breaks, rather than fails, when the command cannot start', () => {
    const missing = { id: 'ghost', argv: ['elvaria-no-such-binary'], timeout_minutes: 1 };
    expect(() => run({ check_id: 'ghost' }, { checks: [missing] }, '.')).toThrow(
      /cannot start elvaria-no-such-binary/,
    );
  });

  it('runs as a process with params and context', () => {
    plot = makePlot();
    const context = JSON.stringify({ checks });
    const done = runScript(
      'run-check.mjs',
      ['--params', '{"check_id":"lint"}', '--context', context],
      plot.dir,
    );
    expect(done.status).toBe(0);
    expect(JSON.parse(done.stdout)).toMatchObject({ pass: false, details: { exit_code: 3 } });
  });
});
