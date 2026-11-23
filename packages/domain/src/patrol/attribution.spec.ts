// What a probe reads and writes (CM-04): a run from a trial (environment never red, out of time or no plot: cannot
// say), the data of `check.attributed`, and the red checks it names in the branch's health, from the log too.
import { describe, expect, it } from 'vitest';

import { SHA_A, SHA_B, TERRITORY, attributed, ran } from './__fixtures__/patrol-log.ts';
import { attributionOf, probeChecksOf, probeRunOf } from './attribution.ts';
import { attributedHealth, baseHealthOf, unattributedOf } from './health.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { TrialCheck } from '../scorecard/trial.ts';

const Q = 'q_20261123_aaaaa1' as QuestId;
const HERE = TERRITORY as TerritoryId;
const step = {
  command: 'node check.mjs',
  pass: true,
  duration_ms: 1000,
  timed_out: false,
  exit_code: 0,
  log_path: 'x.log',
};
const check = (fields: Partial<TrialCheck> = {}): TrialCheck => ({
  ...step,
  id: 'unit',
  timeout_minutes: 5,
  ...fields,
});
const red = check({ pass: false, exit_code: 1 });
const trial = (checks: readonly TrialCheck[], fields = {}) => ({ setup: null, checks, ...fields });
const redOf = (checks: readonly TrialCheck[], fields = {}) => probeRunOf(trial(checks, fields), SHA_A).red;

describe('probeRunOf', () => {
  it('red when a check failed on its own; green when every one passed or failed for its environment', () => {
    expect(redOf([check(), red])).toBe(true);
    expect(redOf([check(), check({ pass: false, environment: 'docker' })])).toBe(false);
  });

  it('cannot say when a check ran out of time, no plot was made, or the setup failed for its environment', () => {
    expect(redOf([red, check({ pass: false, timed_out: true })])).toBeUndefined();
    expect(redOf([], { plot_failure: 'no default branch' })).toBeUndefined();
    expect(redOf([], { setup: { ...step, pass: false, environment: 'docker' } })).toBeUndefined();
    expect(redOf([], { setup: { ...step, pass: false, timed_out: true } })).toBeUndefined();
    expect(redOf([], { setup: { ...step, pass: false } })).toBe(true);
  });

  it('its time is the setup and the checks; the quest of a run on its own head', () => {
    expect(probeRunOf(trial([check(), red], { setup: step }), SHA_B, Q)).toEqual({
      commit: SHA_B,
      quest: Q,
      red: true,
      duration_ms: 3000,
    });
  });

  it('commands.setup is no check to run: it always runs', () => {
    expect(probeChecksOf(['setup', 'unit', 'lint'])).toEqual(['unit', 'lint']);
  });
});

describe('attributionOf', () => {
  it('the runs pass only when green; the step and the culprit when the probe found them', () => {
    const runs = [
      { commit: SHA_A, red: false, duration_ms: 10 },
      { commit: SHA_B, red: undefined, duration_ms: 20 },
      { commit: SHA_B, quest: Q, red: true, duration_ms: 30 },
    ];
    const base = { territory: HERE, source: 'patrol', checks: ['unit'], runs } as const;
    const done = { kind: 'done', cause: 'own_change', commit: SHA_B, culprit: Q } as const;
    expect(attributionOf({ ...base, done })).toEqual({
      territory: HERE,
      source: 'patrol',
      checks: ['unit'],
      runs: [
        { commit: SHA_A, pass: true, duration_ms: 10 },
        { commit: SHA_B, pass: false, duration_ms: 20 },
        { commit: SHA_B, quest: Q, pass: false, duration_ms: 30 },
      ],
      commit: SHA_B,
      culprit: Q,
      cause: 'own_change',
    });
    expect(attributionOf({ ...base, runs: [], done: { kind: 'done', cause: 'unknown' } })).toEqual({
      territory: HERE,
      source: 'patrol',
      checks: ['unit'],
      runs: [],
      cause: 'unknown',
    });
  });
});

describe('the red checks a probe names', () => {
  const T1 = '2026-11-23T06:30:00+07:00';
  const T2 = '2026-11-23T07:00:00+07:00';
  const T3 = '2026-11-23T08:00:00+07:00';
  const both = [
    { id: 'unit', pass: false },
    { id: 'lint', pass: false },
  ];

  it('get its finding and keep it while red; another source, territory, or check is left alone', () => {
    const log = [
      ran(T1, both),
      attributed(T2, { cause: 'outside', commit: SHA_A }),
      attributed(T2, { source: 'queue', checks: ['lint'], cause: 'flaky' }),
      attributed(T2, { territory: 'other' }),
      ran(T3, both),
    ];
    const [health] = baseHealthOf(log);
    expect(health?.red.map(({ check: id, attribution }) => [id, attribution])).toEqual([
      ['unit', { cause: 'outside', commit: SHA_A }],
      ['lint', undefined],
    ]);
    expect(unattributedOf(health)).toEqual(['lint']);
    expect(unattributedOf(undefined)).toEqual([]);
  });

  it('a second probe does not replace the first; a check red again after a green one is unnamed', () => {
    const named = [
      ran(T1, both),
      attributed(T2, { checks: ['unit', 'lint'], cause: 'own_change', culprit: Q }),
    ];
    const [health] = baseHealthOf([...named, ran(T3, [{ id: 'unit', pass: true }, both[1]!]), ran(T3, both)]);
    expect(unattributedOf(health)).toEqual(['unit']);
    const [first] = baseHealthOf(named);
    const again = attributedHealth(first!, {
      territory: HERE,
      source: 'patrol',
      checks: ['unit'],
      runs: [],
      cause: 'unknown',
    });
    expect(again.red.map(({ attribution }) => attribution)).toEqual([
      { cause: 'own_change', culprit: Q },
      { cause: 'own_change', culprit: Q },
    ]);
    const elsewhere = {
      territory: 'other' as TerritoryId,
      source: 'patrol' as const,
      checks: ['unit'],
      runs: [],
      cause: 'flaky' as const,
    };
    expect(attributedHealth(first!, elsewhere)).toBe(first);
  });
});
