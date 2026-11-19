import { describe, expect, it } from 'vitest';

import { at, lineOf, questId, questOf, verdictOf } from './__fixtures__/ledger.ts';
import { THORN, judged, ledgerOf, opening, ref, returned, runsWorld } from './__fixtures__/lessons.ts';
import { lessonEvidenceOf } from './lesson-runs.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

const A = ref('aaaaaa');
const B = ref('bbbbbb');
const Q1 = questId(1);

describe('lessonEvidenceOf (PS-12b)', () => {
  it('reads a run: who worked it, where, how it was judged and the lessons its prompt carried', () => {
    const input = runsWorld([{ result: 'fail', fail_kind: 'wrong_facts', lessons: [A, B], tags: ['docs'] }], {
      events: [
        opening(1, { session: 'a1', attempts: 1, minute: 0, day: '2026-10-01', lessons: [A, B] }),
        lineOf('agent.session.start', { session: 'a1', model: 'sonnet-x' }, at(0, '2026-10-01')),
      ],
    });
    expect(lessonEvidenceOf(input).runs).toEqual([
      {
        quest: Q1,
        n: 1,
        started_at: at(0, '2026-10-01'),
        territory: 'dc1-se-team',
        tags: ['docs'],
        character: 'thorn',
        class: 'knight',
        tribe: 'claude',
        model: 'sonnet-x',
        result: 'fail',
        fail_kind: 'wrong_facts',
        verdict: `${Q1}-1`,
        lessons: [A, B],
        loaded_at: at(0, '2026-10-01'),
      },
    ]);
  });

  it('counts a run once however many sessions the assignee spent in it: the first opening line speaks', () => {
    const input = ledgerOf({
      quests: [
        questOf(1, [
          { n: 1, start: 0, end: 5, session: 's1' },
          { n: 1, start: 20, end: 25, session: 's2' },
        ]),
      ],
      events: [
        opening(1, { session: 's1', attempts: 1, minute: 0, lessons: [A] }),
        opening(1, { session: 's2', attempts: 1, minute: 20, lessons: [B], type: 'quest.unblocked' }),
      ],
      characters: [THORN],
    });
    const { runs } = lessonEvidenceOf(input);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.lessons).toEqual([A]);
  });

  it('gives a run no lessons when its line has none: a resumed session, a trace before PS-12, no trace at all', () => {
    const lines = [
      opening(1, { session: 'a1', attempts: 1, minute: 0 }),
      opening(2, { session: 'a2', attempts: 1, minute: 0, trace: false }),
    ];
    const input = ledgerOf({
      quests: [
        questOf(1, [{ n: 1, start: 0, end: 5, session: 'a1' }]),
        questOf(2, [{ n: 1, start: 0, end: 5, session: 'a2' }]),
      ],
      events: lines,
    });
    expect(lessonEvidenceOf(input).runs.map(({ lessons }) => lessons)).toEqual([[], []]);
  });

  it('knows no class, tribe or model without the character file and the session line', () => {
    const input = runsWorld([{ lessons: [A] }], { characters: [] });
    expect(lessonEvidenceOf(input).runs[0]).toMatchObject({ class: null, tribe: null, model: null });
    const noSession = ledgerOf({ quests: [questOf(1, [{ n: 1, start: 0, end: 5 }])], characters: [THORN] });
    expect(lessonEvidenceOf(noSession).runs[0]).toMatchObject({ model: null, loaded_at: null, lessons: [] });
  });

  it('reads no input but the assignee: not the machine, a mana pause, a judge or a second session of a run', () => {
    const input = ledgerOf({
      quests: [
        questOf(1, [
          { n: 1, character: null, start: 0, end: 1 },
          { n: 1, outcome: 'paused', start: 1, end: 2, session: 'p1' },
          { n: 1, role: 'verifier', start: 3, end: 4, session: 'v1' },
          { n: 1, start: 5, end: 6, session: 'a1' },
          { n: 1, start: 7, end: 8, session: 'a2' },
        ]),
      ],
      characters: [THORN],
    });
    expect(lessonEvidenceOf(input).runs.map(({ n }) => n)).toEqual([1]);
  });

  it('leaves a run undecided without a decisive verdict: none, or a partial one', () => {
    const input = ledgerOf({
      quests: [
        questOf(1, [{ n: 1, start: 0, end: 5, session: 'a1' }]),
        questOf(2, [{ n: 1, start: 0, end: 5 }]),
      ],
      verdicts: [verdictOf(1, 1, 'partial', { minute: 6 })],
      characters: [THORN],
    });
    expect(
      lessonEvidenceOf(input).runs.map(({ result, fail_kind, verdict }) => [result, fail_kind, verdict]),
    ).toEqual([
      [undefined, null, null],
      [undefined, null, null],
    ]);
  });

  it('takes the latest fail of a run, and a fail over a pass: the owner can return what a judge passed', () => {
    const input = ledgerOf({
      quests: [questOf(1, [{ n: 1, start: 0, end: 5, session: 'a1' }])],
      verdicts: [
        judged(1, 'fail', 'v1', 6, 'style'),
        { ...returned(1, 20, false), fail_kind: 'unsafe' },
        { ...judged(1, 'pass', 'v2', 30), id: `${Q1}-1-p9` as Verdict['id'] },
      ],
      characters: [THORN],
    });
    expect(lessonEvidenceOf(input).runs[0]).toMatchObject({
      result: 'fail',
      fail_kind: 'unsafe',
      verdict: `${Q1}-1-user`,
    });
  });

  it('reads a fail written without a kind as `other`, as the rework table does', () => {
    const { fail_kind: _kind, ...bare } = judged(1, 'fail', 'v1', 6, 'style');
    const input = ledgerOf({
      quests: [questOf(1, [{ n: 1, start: 0, end: 5 }])],
      verdicts: [bare],
      characters: [THORN],
    });
    expect(lessonEvidenceOf(input).runs[0]?.fail_kind).toBe('other');
  });
});
