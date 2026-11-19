import { describe, expect, it } from 'vitest';

import { at, questId } from './__fixtures__/ledger.ts';
import { dayOfRun, opening, ref, runsWorld } from './__fixtures__/lessons.ts';
import { metricsOf } from './metrics-of.ts';
import type { LessonFact } from './ledger.ts';
import type { RunRow } from './__fixtures__/lessons.ts';

const A = ref('aaaaaa');
const FACTS: readonly LessonFact[] = [{ ref: A as LessonFact['ref'], fail_kind: 'style', scope: {} }];

/** Two style failures before the line, then three runs that carried it: a pass, a style failure, a pass. */
const ROWS: readonly RunRow[] = [
  { result: 'fail', fail_kind: 'style' },
  { result: 'fail', fail_kind: 'style' },
  { result: 'pass' },
  { result: 'pass', lessons: [A] },
  { result: 'fail', fail_kind: 'style', lessons: [A] },
  { result: 'pass', lessons: [A] },
];

describe('the lesson tables of the ledger (PS-12b)', () => {
  it('answers the three questions: which failures repeat, how their rates move, what each line did', () => {
    const metrics = metricsOf(runsWorld(ROWS, { lessons: FACTS }));
    expect(metrics.lessons).toEqual([
      {
        ref: A,
        fail_kind: 'style',
        loads: 3,
        helped: 2,
        missed: 1,
        first_at: at(0, dayOfRun(3)),
        last_at: at(0, dayOfRun(5)),
        // Three runs carried it: too few to call.
        effect: {
          result: 'too_early',
          before: { runs: 3, failed: 2 },
          with: { runs: 3, failed: 1 },
          points: null,
        },
      },
    ]);
    expect(metrics.fail_kinds).toEqual([
      {
        fail_kind: 'style',
        failed: 3,
        buckets: [{ from: at(0, dayOfRun(0)), to: at(0, dayOfRun(5)), runs: 6, failed: 3 }],
      },
    ]);
    expect(
      metrics.repeats.map(({ fail_kind, members }) => [fail_kind, members.map(({ quest }) => quest)]),
    ).toEqual([['style', [questId(1), questId(2), questId(5)]]]);
  });

  it('reads the window like every other number: the runs that started in it', () => {
    const metrics = metricsOf(runsWorld(ROWS, { lessons: FACTS }), { since: dayOfRun(3) });
    expect(metrics.lessons.map(({ loads, helped, missed }) => [loads, helped, missed])).toEqual([[3, 2, 1]]);
    expect(metrics.fail_kinds.map(({ failed, buckets }) => [failed, buckets.length])).toEqual([[1, 1]]);
    // One failure of the kind in the window: no repeat.
    expect(metrics.repeats).toEqual([]);
  });

  it('gives an empty lessons table for a ledger written before PS-12: no trace names a line', () => {
    const before = ROWS.map(({ lessons: _lessons, ...row }) => row);
    const metrics = metricsOf(runsWorld(before, { lessons: FACTS }));
    expect(metrics.lessons).toEqual([]);
    // The other two tables read verdicts alone and still have their rows.
    expect(metrics.fail_kinds[0]).toMatchObject({ fail_kind: 'style', failed: 3 });
    expect(metrics.repeats).toHaveLength(1);
  });

  it('takes a run whose prompt has no `lessons` for a run that loaded no line: a resumed session, an empty file', () => {
    const input = runsWorld(ROWS, {
      lessons: FACTS,
      // The opening line of run 6 has a load trace without `lessons`: a resumed session, an empty scripture.
      events: [
        ...runsWorld(ROWS).events.slice(0, 5),
        opening(6, { session: 'a6', attempts: 1, minute: 0, day: dayOfRun(5) }),
      ],
    });
    expect(metricsOf(input).lessons.map(({ loads, helped, missed }) => [loads, helped, missed])).toEqual([
      [2, 1, 1],
    ]);
  });

  it('counts a ledger read without facts, or without characters: loads for each ref, no kind', () => {
    const input = runsWorld(ROWS, { characters: [] });
    const [row] = metricsOf(input).lessons;
    expect(row).toMatchObject({ ref: A, fail_kind: null, loads: 3, helped: 0, missed: 0, effect: null });
  });
});
