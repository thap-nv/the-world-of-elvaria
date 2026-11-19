import { describe, expect, it } from 'vitest';

import { at } from './__fixtures__/ledger.ts';
import { dayOfRun, evidenceRun, runsOf } from './__fixtures__/lessons.ts';
import { failKindRatesOf } from './fail-kind-rates.ts';
import type { FailKind } from '../schema/common.ts';

/** Run `index` of a world: failed with `kinds[index]` when it has one, else passed. */
const failing =
  (kinds: Readonly<Record<number, FailKind>>) =>
  (index: number): { result: 'pass' | 'fail'; fail_kind?: FailKind } => {
    const kind = kinds[index];
    return kind === undefined ? { result: 'pass' } : { result: 'fail', fail_kind: kind };
  };

describe('failKindRatesOf (PS-12b)', () => {
  it('cuts 40 judged runs into two buckets of 20, oldest first, and counts each kind in each', () => {
    // style: runs 1, 5 and 25; tests_fail: run 30; the rest passed.
    const runs = runsOf(40, failing({ 1: 'style', 5: 'style', 25: 'style', 30: 'tests_fail' }));
    expect(failKindRatesOf({ runs, judgements: [] })).toEqual([
      {
        fail_kind: 'style',
        failed: 3,
        buckets: [
          { from: at(0, dayOfRun(0)), to: at(0, dayOfRun(19)), runs: 20, failed: 2 },
          { from: at(0, dayOfRun(20)), to: at(0, dayOfRun(39)), runs: 20, failed: 1 },
        ],
      },
      {
        fail_kind: 'tests_fail',
        failed: 1,
        buckets: [
          { from: at(0, dayOfRun(0)), to: at(0, dayOfRun(19)), runs: 20, failed: 0 },
          { from: at(0, dayOfRun(20)), to: at(0, dayOfRun(39)), runs: 20, failed: 1 },
        ],
      },
    ]);
  });

  it('leaves the newest bucket short while it fills, so a full bucket never changes', () => {
    const runs = runsOf(45, failing({ 44: 'unsafe' }));
    const [row] = failKindRatesOf({ runs, judgements: [] });
    expect(row?.buckets.map(({ runs: count }) => count)).toEqual([20, 20, 5]);
    expect(row?.buckets[2]).toEqual({
      from: at(0, dayOfRun(40)),
      to: at(0, dayOfRun(44)),
      runs: 5,
      failed: 1,
    });
  });

  it('counts only judged runs: a run no verdict decided takes no place in a bucket', () => {
    const runs = [
      ...runsOf(10, failing({ 2: 'other' })),
      evidenceRun({ started_at: at(0, dayOfRun(10)) }),
      ...runsOf(10, failing({}), 11),
    ];
    const [row] = failKindRatesOf({ runs, judgements: [] });
    expect(row?.buckets).toEqual([
      { from: at(0, dayOfRun(0)), to: at(0, dayOfRun(20)), runs: 20, failed: 1 },
    ]);
  });

  it('puts the kind that failed most first, equal ones in the order of the kinds, flaky among them', () => {
    const runs = runsOf(
      8,
      failing({
        0: 'style',
        1: 'flaky',
        2: 'incomplete',
        3: 'style',
        4: 'incomplete',
        5: 'flaky',
        6: 'flaky',
      }),
    );
    expect(
      failKindRatesOf({ runs, judgements: [] }).map(({ fail_kind, failed }) => [fail_kind, failed]),
    ).toEqual([
      ['flaky', 3],
      ['incomplete', 2],
      ['style', 2],
    ]);
  });

  it('has no row when nothing failed, and none when no run was judged', () => {
    expect(failKindRatesOf({ runs: runsOf(5, failing({})), judgements: [] })).toEqual([]);
    expect(failKindRatesOf({ runs: [evidenceRun()], judgements: [] })).toEqual([]);
    expect(failKindRatesOf({ runs: [], judgements: [] })).toEqual([]);
  });
});
