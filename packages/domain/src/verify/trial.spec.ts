import { describe, expect, it } from 'vitest';

import { FLAKE_RUNS, LOCK_MARGIN_MINUTES } from '../constants.ts';
import {
  coverageDropsOf,
  coveragePctOf,
  coverageTotalsOf,
  exclusiveWaitMinutes,
  flakyChecksOf,
  rerunDue,
} from './trial.ts';

const green = [
  { id: 'lint', pass: true },
  { id: 'e2e', pass: true },
];
const red = [
  { id: 'lint', pass: true },
  { id: 'e2e', pass: false },
];

describe('exclusiveWaitMinutes', () => {
  const checks = [
    { exclusive: true, timeout_minutes: 30 },
    { exclusive: false, timeout_minutes: 90 },
    { exclusive: true, timeout_minutes: 10 },
  ];
  const breakers = { attempt_minutes: { low: 45, high: 120 } };

  it("waits out the longest exclusive check, and a scratch judge's session when a ritual has one", () => {
    expect(exclusiveWaitMinutes(checks, [{}, { scratch_plot: false }], breakers)).toBe(
      30 + LOCK_MARGIN_MINUTES,
    );
    expect(exclusiveWaitMinutes(checks, [{ scratch_plot: true }], breakers)).toBe(
      30 + 120 + LOCK_MARGIN_MINUTES,
    );
    expect(exclusiveWaitMinutes([], [], breakers)).toBe(LOCK_MARGIN_MINUTES);
  });
});

describe('rerunDue', () => {
  it('asks for another run while every run passed and fewer than the runs wanted ran', () => {
    expect(rerunDue([], FLAKE_RUNS)).toBe(true);
    expect(rerunDue([green], FLAKE_RUNS)).toBe(true);
    expect(rerunDue([green, green], FLAKE_RUNS)).toBe(true);
    expect(rerunDue([green, green, green], FLAKE_RUNS)).toBe(false);
    expect(rerunDue([green], 1)).toBe(false);
  });

  it('stops at the first run with a failing check', () => {
    expect(rerunDue([red], FLAKE_RUNS)).toBe(false);
    expect(rerunDue([green, red], FLAKE_RUNS)).toBe(false);
  });
});

describe('flakyChecksOf', () => {
  it('names the checks that passed in one run and failed in another', () => {
    expect(flakyChecksOf([green, green, red])).toEqual(['e2e']);
    expect(flakyChecksOf([red, green])).toEqual(['e2e']);
  });

  it('names none when every check gave the same answer in every run', () => {
    expect(flakyChecksOf([green, green, green])).toEqual([]);
    expect(flakyChecksOf([red])).toEqual([]);
    expect(flakyChecksOf([])).toEqual([]);
  });

  // P1-54: Q7 and Q1 of P1-50, whose third e2e run another quest's commands.reset pulled down.
  it('names no flake for a run that failed because of its environment', () => {
    const gone = [
      { id: 'lint', pass: true },
      { id: 'e2e', pass: false, environment: 'dependency db failed to start: No such container' },
    ];
    expect(flakyChecksOf([green, green, gone])).toEqual([]);
    // A test that failed in another run is a flake all the same.
    expect(flakyChecksOf([green, red, gone])).toEqual(['e2e']);
  });
});

const summary = (lines: [number, number], branches?: [number, number]) => ({
  total: {
    lines: { total: lines[0], covered: lines[1], skipped: 0, pct: 0 },
    ...(branches === undefined ? {} : { branches: { total: branches[0], covered: branches[1] } }),
  },
  'src/a.ts': { lines: { total: 1, covered: 1 } },
});

describe('coverageTotalsOf', () => {
  it('reads the totals of an istanbul json-summary', () => {
    expect(coverageTotalsOf(summary([10, 8], [4, 1]))).toEqual({
      ok: true,
      value: { lines: { total: 10, covered: 8 }, branches: { total: 4, covered: 1 } },
    });
  });

  it.each([
    ['not an object', 'coverage'],
    ['no total', { 'src/a.ts': {} }],
    ['a total that is no object', { total: [] }],
    [
      'no metric it knows',
      { total: { lines: { total: 2, covered: 3 }, functions: { total: 1.5, covered: 1 } } },
    ],
  ])('refuses %s', (_, value) => {
    expect(coverageTotalsOf(value)).toEqual({ ok: false, error: { code: 'not_a_summary' } });
  });
});

describe('coverageDropsOf', () => {
  it('names each metric on which the branch covers a smaller share than its base', () => {
    const head = { lines: { total: 200, covered: 159 }, branches: { total: 10, covered: 10 } };
    const base = { lines: { total: 100, covered: 80 }, branches: { total: 0, covered: 0 } };
    expect(coverageDropsOf(head, base)).toEqual([{ metric: 'lines', head_pct: 79.5, base_pct: 80 }]);
  });

  it('keeps an equal or a higher share, and compares only what both measure', () => {
    const head = { lines: { total: 200, covered: 160 }, functions: { total: 0, covered: 0 } };
    const base = { lines: { total: 100, covered: 80 }, statements: { total: 5, covered: 5 } };
    expect(coverageDropsOf(head, base)).toEqual([]);
    expect(
      coverageDropsOf({ functions: { total: 3, covered: 2 } }, { functions: { total: 0, covered: 0 } }),
    ).toEqual([{ metric: 'functions', head_pct: (2 / 3) * 100, base_pct: 100 }]);
  });

  it('counts nothing to cover as fully covered', () => {
    const none = { branches: { total: 0, covered: 0 } };
    expect(coverageDropsOf(none, { branches: { total: 4, covered: 1 } })).toEqual([]);
    expect(coveragePctOf({ total: 0, covered: 0 })).toBe(100);
    expect(coveragePctOf({ total: 4, covered: 1 })).toBe(25);
  });
});
