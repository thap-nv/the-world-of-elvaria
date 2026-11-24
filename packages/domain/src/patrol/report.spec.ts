// What a patrol writes (PS-26): `patrol.ran` from a trial and its scans, and how a scan's run reads by its `produces`.
import { describe, expect, it } from 'vitest';

import { PATROL_LINE_MAX_LENGTH } from '../constants.ts';
import { PatrolRanDataSchema } from '../schema/event/patrol-data.ts';
import { patrolRanOf, scanOf } from './report.ts';
import type { CheckId, ScriptId, TerritoryId } from '../core/ids.ts';
import type { TerritoryTrial, TrialCheck } from '../scorecard/trial.ts';

const TERRITORY = 'elvaria' as TerritoryId;
const LINK = 'link-check' as ScriptId;
const step = { command: 'pnpm i', pass: true, duration_ms: 5, timed_out: false, exit_code: 0, log_path: 'l' };
const check = (extra: Partial<TrialCheck>): TrialCheck => ({
  ...step,
  id: 'unit' as CheckId,
  timeout_minutes: 5,
  ...extra,
});

describe('patrolRanOf', () => {
  it('keeps each check, its first error line clipped, and counts a failure for its environment as such', () => {
    const long = `FAIL ${'x'.repeat(PATROL_LINE_MAX_LENGTH)}`;
    const trial: TerritoryTrial = {
      base: 'a'.repeat(40),
      setup: { ...step, pass: false, error_line: '  ' },
      checks: [
        check({ pass: false, exit_code: 1, error_line: long }),
        check({ id: 'e2e' as CheckId, pass: false, environment: 'Cannot connect to the Docker daemon' }),
        check({ id: 'lint' as CheckId, environment: 'ignored on a pass' }),
      ],
    };
    const data = patrolRanOf({ territory: TERRITORY, trigger: 'schedule', trial, scans: [] });
    expect(PatrolRanDataSchema.parse(data)).toEqual(data);
    expect(data.setup).toEqual({ pass: false, log_path: 'l' });
    expect(data.checks.map(({ environment }) => environment)).toEqual([false, true, false]);
    expect(data.checks[0]?.error_line).toHaveLength(PATROL_LINE_MAX_LENGTH);
    expect(data.checks[0]?.error_line?.endsWith('…')).toBe(true);
    expect(data).not.toHaveProperty('plot_failure');
  });

  it('says why no plot was made, even when git said nothing', () => {
    const trial = (failure: string): TerritoryTrial => ({
      base: null,
      plot_failure: failure,
      setup: null,
      checks: [],
    });
    const told = patrolRanOf({
      territory: TERRITORY,
      trigger: 'schedule',
      trial: trial('fatal: x'),
      scans: [],
    });
    expect(told).toMatchObject({ head: null, plot_failure: 'fatal: x', setup: null, checks: [] });
    const silent = patrolRanOf({ territory: TERRITORY, trigger: 'schedule', trial: trial(' '), scans: [] });
    expect(silent.plot_failure).toBe('no plot could be made');
  });
});

describe('scanOf', () => {
  const run = (stdout: string, exit_code: number | null = 0) => ({
    exit_code,
    timed_out: false,
    stdout,
    stderr: '',
  });
  const units = (outcomes: readonly string[]) =>
    JSON.stringify({ units: outcomes.map((outcome, n) => ({ id: `u${n}`, label: 'a link', outcome })) });

  it('counts a batch’s units not done, and fails it then', () => {
    expect(scanOf(LINK, 'units', run(units(['done', 'not_done', 'not_done'])))).toEqual({
      script: LINK,
      outcome: 'fail',
      count: 2,
    });
    expect(scanOf(LINK, 'units', run(units(['done'])))).toEqual({ script: LINK, outcome: 'pass', count: 0 });
  });

  it('reads a report’s data.total when it is a count, and nothing else', () => {
    const report = (data: unknown) => run(JSON.stringify({ summary: 's', data }));
    expect(scanOf(LINK, 'report', report({ total: 12 }))).toEqual({
      script: LINK,
      outcome: 'pass',
      count: 12,
    });
    expect(scanOf(LINK, 'report', report({ total: -1 }))).toEqual({ script: LINK, outcome: 'pass' });
    expect(scanOf(LINK, 'report', report(null))).toEqual({ script: LINK, outcome: 'pass' });
    expect(scanOf(LINK, 'check', run(JSON.stringify({ pass: false, details: {} })))).toEqual({
      script: LINK,
      outcome: 'fail',
    });
  });

  it('a script that refused, broke, ran too long or is not in the catalog', () => {
    expect(scanOf(LINK, 'units', run('', 2)).outcome).toBe('usage');
    expect(scanOf(LINK, 'units', run('', 1)).outcome).toBe('broken');
    expect(scanOf(LINK, 'units', { ...run(''), timed_out: true }).outcome).toBe('timeout');
    expect(scanOf(LINK, undefined, undefined)).toEqual({ script: LINK, outcome: 'unknown' });
  });
});
