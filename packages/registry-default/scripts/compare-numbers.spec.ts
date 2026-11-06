import { afterEach, describe, expect, it } from 'vitest';

import { UsageError } from './common.mjs';
import { numbersOf, run } from './compare-numbers.mjs';
import { makePlot, runScript } from './test-plot.ts';
import type { Plot } from './test-plot.ts';

let plot: Plot | undefined;
afterEach(() => plot?.remove());

const expected = {
  total: 120,
  rows: [{ count: 2 }, { count: 3 }],
  'a/b~c': 4,
  note: 'text',
  ok: true,
  none: null,
};
const actual = { total: 120.05, rows: [{ count: 2 }, { count: 4 }], extra: 9 };

describe('numbersOf', () => {
  it('keys every number by its JSON Pointer, escaping ~ and /', () => {
    expect([...numbersOf(expected)]).toEqual([
      ['/total', 120],
      ['/rows/0/count', 2],
      ['/rows/1/count', 3],
      ['/a~1b~0c', 4],
    ]);
    expect([...numbersOf(7)]).toEqual([['', 7]]);
  });
});

describe('compare-numbers', () => {
  const files = { 'out/expected.json': JSON.stringify(expected), 'out/actual.json': JSON.stringify(actual) };
  const params = { expected_path: 'out/expected.json', actual_path: 'out/actual.json' };

  it('lists numbers that differ by more than the tolerance, or are missing', () => {
    plot = makePlot(files);
    expect(run({ ...params, tolerance: 0.1 }, {}, plot.dir)).toEqual({
      pass: false,
      details: {
        compared: 4,
        tolerance: 0.1,
        mismatches: [
          { pointer: '/rows/1/count', expected: 3, actual: 4 },
          { pointer: '/a~1b~0c', expected: 4, actual: null },
        ],
      },
    });
  });

  it('compares exactly by default, and passes when every number matches', () => {
    plot = makePlot(files);
    const exact = run(params, {}, plot.dir) as { details: { mismatches: unknown[] } };
    expect(exact.details.mismatches).toHaveLength(3);
    const same = run({ expected_path: 'out/expected.json', actual_path: 'out/expected.json' }, {}, plot.dir);
    expect(same).toMatchObject({ pass: true, details: { compared: 4, mismatches: [] } });
  });

  it.each([
    [{ ...params, tolerance: -1 }, 'params.tolerance'],
    [{ ...params, tolerance: '0.1' }, 'params.tolerance'],
    [{ ...params, expected_path: '../outside.json' }, 'must stay inside the plot'],
    [{ actual_path: 'out/actual.json' }, 'params.expected_path'],
  ])('refuses %j', (bad, message) => {
    plot = makePlot(files);
    expect(() => run(bad, {}, plot?.dir ?? '')).toThrow(UsageError);
    expect(() => run(bad, {}, plot?.dir ?? '')).toThrow(message);
  });

  it('breaks on a file that is missing or not JSON', () => {
    plot = makePlot({ ...files, 'out/broken.json': '{ "total": ' });
    expect(() => run({ ...params, actual_path: 'out/missing.json' }, {}, plot?.dir ?? '')).toThrow(
      'cannot be read',
    );
    expect(() => run({ ...params, actual_path: 'out/broken.json' }, {}, plot?.dir ?? '')).toThrow(
      'is not valid JSON',
    );
  });

  it('runs as a process', () => {
    plot = makePlot(files);
    const args = ['--params', JSON.stringify({ ...params, tolerance: 1 })];
    const result = runScript('compare-numbers.mjs', args, plot.dir);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ pass: false, details: { compared: 4 } });
  });
});
