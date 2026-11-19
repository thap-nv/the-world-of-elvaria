import { describe, expect, it } from 'vitest';

import { at, questId, questOf } from './__fixtures__/ledger.ts';
import {
  THORN,
  VESPER,
  judged,
  ledgerOf,
  opening,
  ref,
  returned,
  runsWorld,
} from './__fixtures__/lessons.ts';
import { trailsOf } from './ledger.ts';
import { lessonEvidenceOf } from './lesson-runs.ts';
import { ObjectionSchema } from '../schema/quest/objection.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

const A = ref('aaaaaa');
const B = ref('bbbbbb');
const J = ref('jjjjjj');
const Q1 = questId(1);

describe('lessonEvidenceOf: rulings, judge sessions and the window (PS-12b)', () => {
  describe('what is no fail', () => {
    const quest = questOf(1, [
      { n: 1, start: 0, end: 5, session: 'a1' },
      { n: 1, role: 'verifier', character: 'vesper', start: 6, end: 8, session: 'v1' },
    ]);
    const lines = [
      opening(1, { session: 'a1', attempts: 1, minute: 0, lessons: [A] }),
      opening(1, { session: 'v1', attempts: 1, status: 'review', minute: 6, lessons: [J] }),
    ];

    it('a pass the owner returned: the run fails, and the judge’s verdict did not stand', () => {
      const input = ledgerOf({
        quests: [quest],
        verdicts: [judged(1, 'pass', 'v1', 8), returned(1, 20, false)],
        events: lines,
        characters: [THORN, VESPER],
      });
      const { runs, judgements } = lessonEvidenceOf(input);
      expect(runs[0]).toMatchObject({ result: 'fail', fail_kind: 'other' });
      expect(judgements).toEqual([{ quest: Q1, n: 1, session: 'v1', at: at(6), lessons: [J], stood: false }]);
    });

    it('a return with `rejudge`: the judge erred, not the assignee, so the pass left stands for the run', () => {
      const input = ledgerOf({
        quests: [quest],
        verdicts: [judged(1, 'pass', 'v1', 8), returned(1, 20, true)],
        events: lines,
        characters: [THORN, VESPER],
      });
      const { runs, judgements } = lessonEvidenceOf(input);
      expect(runs[0]).toMatchObject({ result: 'pass', fail_kind: null, verdict: null });
      expect(judgements[0]?.stood).toBe(false);
    });

    it('a fail a second judge overturned through an objection: the first run is undecided, the judge was wrong', () => {
      const objection = ObjectionSchema.parse({
        memo: 'm_20261108_aaaaaa',
        verdict: `${Q1}-1`,
        judge: 'vesper',
      });
      const second: Verdict = { ...judged(2, 'pass', 'v2', 30), objection };
      const input = ledgerOf({
        quests: [
          questOf(1, [
            { n: 1, start: 0, end: 5, session: 'a1' },
            { n: 1, role: 'verifier', start: 6, end: 8, session: 'v1' },
            { n: 2, start: 20, end: 25, session: 'a2' },
            { n: 2, role: 'verifier', start: 26, end: 28, session: 'v2' },
          ]),
        ],
        verdicts: [judged(1, 'fail', 'v1', 8, 'tests_fail'), second],
        events: [
          opening(1, { session: 'v1', attempts: 1, status: 'review', minute: 6 }),
          opening(1, { session: 'v2', attempts: 2, status: 'review', minute: 26 }),
        ],
        characters: [THORN],
      });
      const { runs, judgements } = lessonEvidenceOf(input);
      expect(runs.map(({ n, result }) => [n, result])).toEqual([
        [1, undefined],
        [2, 'pass'],
      ]);
      expect(judgements.map(({ session, stood }) => [session, stood])).toEqual([
        ['v1', false],
        ['v2', true],
      ]);
    });

    it('a judge’s fail that no one contested stood', () => {
      const input = ledgerOf({
        quests: [quest],
        verdicts: [judged(1, 'fail', 'v1', 8, 'style')],
        events: lines,
        characters: [THORN],
      });
      expect(lessonEvidenceOf(input).judgements[0]?.stood).toBe(true);
    });
  });

  describe('the judge sessions', () => {
    it('leave stood open when no verdict of the judge can be joined: none, a partial one, the owner’s, no session', () => {
      const lineOf3 = (session: string | undefined): ReturnType<typeof opening> =>
        opening(1, {
          ...(session === undefined ? {} : { session }),
          attempts: 1,
          status: 'review',
          minute: 6,
        });
      const input = ledgerOf({
        quests: [questOf(1, [{ n: 1, start: 0, end: 5, session: 'a1' }])],
        verdicts: [
          judged(1, 'partial', 'p1', 7),
          { ...returned(1, 9, false), session_id: 'o1' },
          judged(1, 'pass', undefined, 10),
        ],
        events: [lineOf3('none'), lineOf3('p1'), lineOf3('o1'), lineOf3(undefined)],
        characters: [THORN],
      });
      expect(lessonEvidenceOf(input).judgements.map(({ stood }) => stood)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    });

    it('count each session once, and the first line of a session without a name once per run', () => {
      const input = ledgerOf({
        quests: [questOf(1, [{ n: 1, start: 0, end: 5, session: 'a1' }])],
        events: [
          opening(1, { session: 'v1', attempts: 1, status: 'review', minute: 6 }),
          opening(1, { session: 'v1', attempts: 1, status: 'review', minute: 7 }),
          opening(1, { attempts: 1, status: 'review', minute: 8 }),
          opening(1, { attempts: 1, status: 'review', minute: 9 }),
        ],
        characters: [THORN],
      });
      expect(lessonEvidenceOf(input).judgements.map(({ session, at: when }) => [session, when])).toEqual([
        ['v1', at(6)],
        [undefined, at(8)],
      ]);
    });
  });

  it('puts a line of a session the attempt log does not name at the run the quest view says, by its status', () => {
    const input = ledgerOf({
      quests: [questOf(1, [{ n: 1, start: 0, end: 5 }])],
      events: [
        opening(1, { session: 'unknown', attempts: 1, minute: 0, lessons: [A] }),
        opening(1, { session: 'unknown-judge', attempts: 1, status: 'review', minute: 6, lessons: [J] }),
      ],
      characters: [THORN],
    });
    const { runs, judgements } = lessonEvidenceOf(input);
    expect(runs[0]?.lessons).toEqual([A]);
    expect(judgements[0]).toMatchObject({ n: 1, lessons: [J] });
  });

  it('reads the runs that started in the window, oldest first, and the judges opened in it', () => {
    const input = runsWorld([{ lessons: [A] }, { lessons: [B] }, { lessons: [A] }], {
      events: [
        opening(2, { session: 'a2', attempts: 1, minute: 0, day: '2026-10-02', lessons: [B] }),
        opening(1, { session: 'a1', attempts: 1, minute: 0, day: '2026-10-01', lessons: [A] }),
        opening(3, { session: 'v3', attempts: 1, status: 'review', minute: 6, day: '2026-10-03' }),
        opening(3, { session: 'v3b', attempts: 1, status: 'review', minute: 6, day: '2026-10-09' }),
      ],
    });
    expect(lessonEvidenceOf(input).runs.map(({ quest }) => quest)).toEqual([
      questId(1),
      questId(2),
      questId(3),
    ]);
    const window = { since: '2026-10-02', until: '2026-10-03' };
    const inside = lessonEvidenceOf(input, window);
    expect(inside.runs.map(({ quest }) => quest)).toEqual([questId(2), questId(3)]);
    expect(inside.judgements.map(({ session }) => session)).toEqual(['v3']);
  });

  it('orders runs that started together by quest and by number', () => {
    const input = ledgerOf({
      quests: [
        questOf(2, [{ n: 1, start: 0, end: 1, session: 'b' }]),
        questOf(1, [
          { n: 1, start: 0, end: 1, session: 'a' },
          { n: 2, start: 0, end: 1, session: 'c' },
        ]),
      ],
      characters: [THORN],
    });
    expect(lessonEvidenceOf(input).runs.map(({ quest, n }) => [quest, n])).toEqual([
      [questId(1), 1],
      [questId(1), 2],
      [questId(2), 1],
    ]);
  });

  it('reads the trails the caller gives it, and reads them itself without', () => {
    const input = runsWorld([{ result: 'pass', lessons: [A] }, { lessons: [B] }]);
    const trails = trailsOf(input);
    expect(lessonEvidenceOf(input, {}, trails.slice(1)).runs.map(({ quest }) => quest)).toEqual([questId(2)]);
    expect(lessonEvidenceOf(input).runs.map(({ quest }) => quest)).toEqual([questId(1), questId(2)]);
  });
});
