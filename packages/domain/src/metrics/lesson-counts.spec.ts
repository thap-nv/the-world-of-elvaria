import { describe, expect, it } from 'vitest';

import { at } from './__fixtures__/ledger.ts';
import { dayOfRun, evidenceJudgement, evidenceRun, ref, runsOf } from './__fixtures__/lessons.ts';
import { lessonCountsOf } from './lesson-counts.ts';
import type { LessonFact } from './ledger.ts';
import type { FailKind } from '../schema/common.ts';

const A = ref('aaaaaa');
const B = ref('bbbbbb');
const C = ref('cccccc');

/** What the scripture says of a line: the kind it cures, and no scope. */
const fact = (lesson: string, fail_kind: FailKind | null): LessonFact => ({
  ref: lesson as LessonFact['ref'],
  fail_kind,
  scope: {},
});

const FACTS = [fact(A, 'wrong_facts'), fact(B, null)];

describe('lessonCountsOf (PS-12b)', () => {
  it('counts a run that passed, or failed with another kind, as a help; one that failed with its kind as a miss', () => {
    const runs = runsOf(5, (index) => ({
      lessons: [A],
      ...[
        { result: 'pass' as const },
        { result: 'fail' as const, fail_kind: 'wrong_facts' as const },
        { result: 'fail' as const, fail_kind: 'style' as const },
        {},
        { result: 'fail' as const, fail_kind: 'wrong_facts' as const },
      ][index],
    }));
    expect(lessonCountsOf({ runs, judgements: [] }, FACTS)).toEqual([
      {
        ref: A,
        fail_kind: 'wrong_facts',
        // The fourth run has no verdict: a load and nothing else.
        loads: 5,
        helped: 2,
        missed: 2,
        first_at: at(0, dayOfRun(0)),
        last_at: at(0, dayOfRun(4)),
      },
    ]);
  });

  it('gives a line with no kind loads and nothing else, and so a line the files no longer have', () => {
    const runs = runsOf(2, () => ({ lessons: [B, C], result: 'pass' as const }));
    expect(lessonCountsOf({ runs, judgements: [] }, FACTS)).toEqual([
      {
        ref: B,
        fail_kind: null,
        loads: 2,
        helped: 0,
        missed: 0,
        first_at: runs[0]?.loaded_at,
        last_at: runs[1]?.loaded_at,
      },
      {
        ref: C,
        fail_kind: null,
        loads: 2,
        helped: 0,
        missed: 0,
        first_at: runs[0]?.loaded_at,
        last_at: runs[1]?.loaded_at,
      },
    ]);
  });

  it('counts a line twice in one prompt once, and dates a run by its opening line, else by its start', () => {
    const runs = [
      evidenceRun({ lessons: [A, A], result: 'pass', started_at: at(0), loaded_at: at(2) }),
      evidenceRun({ lessons: [A], result: 'pass', started_at: at(10), loaded_at: null }),
    ];
    expect(lessonCountsOf({ runs, judgements: [] }, FACTS)).toMatchObject([
      { ref: A, loads: 2, helped: 2, first_at: at(2), last_at: at(10) },
    ]);
  });

  it('counts a judge session by its own verdict: one that stood helped, one overturned missed, none only loaded', () => {
    const judgements = [
      evidenceJudgement({ lessons: [A], stood: true, at: at(6) }),
      evidenceJudgement({ lessons: [A], stood: false, at: at(7) }),
      evidenceJudgement({ lessons: [A, B], stood: undefined, at: at(8) }),
      evidenceJudgement({ lessons: [B], stood: false, at: at(9) }),
    ];
    expect(lessonCountsOf({ runs: [], judgements }, FACTS)).toEqual([
      // B has no kind: its two loads say nothing of its verdicts.
      { ref: A, fail_kind: 'wrong_facts', loads: 3, helped: 1, missed: 1, first_at: at(6), last_at: at(8) },
      { ref: B, fail_kind: null, loads: 2, helped: 0, missed: 0, first_at: at(8), last_at: at(9) },
    ]);
  });

  it('dates a line from the earliest load and the latest, whichever side loaded it', () => {
    const runs = [evidenceRun({ lessons: [A], result: 'pass', loaded_at: at(30) })];
    const judgements = [evidenceJudgement({ lessons: [A], stood: true, at: at(6) })];
    expect(lessonCountsOf({ runs, judgements }, FACTS)).toMatchObject([
      { ref: A, loads: 2, first_at: at(6), last_at: at(30) },
    ]);
  });

  it('lists the most loaded line first, equal ones by ref, and nothing when no prompt carried a line', () => {
    const runs = [
      evidenceRun({ lessons: [C, B], result: 'pass' }),
      evidenceRun({ lessons: [C, A], result: 'pass' }),
      evidenceRun({ lessons: [C], result: 'pass' }),
    ];
    expect(lessonCountsOf({ runs, judgements: [] }, FACTS).map(({ ref: lesson }) => lesson)).toEqual([
      C,
      A,
      B,
    ]);
    expect(lessonCountsOf({ runs: [evidenceRun()], judgements: [] }, FACTS)).toEqual([]);
  });
});
