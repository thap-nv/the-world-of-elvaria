import { describe, expect, it } from 'vitest';

import { at, lineOf, questId, verdictOf } from './__fixtures__/ledger.ts';
import { memoCountsOf, objectionsOf } from './memo-counts.ts';
import type { MemoId } from '../core/ids.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

const NEXT_DAY = '2026-11-09';
const filed = (memo: string, kind: string, ts: string) =>
  lineOf('memo.filed', { memo, kind, from: 'thorn' }, ts, questId(1));
const routed = (memo: string, route: string, ts: string) =>
  lineOf('memo.routed', { memo, route }, ts, questId(1));

/** The second judge's verdict on run `attempt` of quest `n`, answering an objection to `judge`'s verdict. */
const answering = (
  n: number,
  attempt: number,
  result: Verdict['result'],
  judge: string,
  minute = 30,
): Verdict => ({
  ...verdictOf(n, attempt, result, { minute, ...(result === 'fail' ? { fail_kind: 'tests_fail' } : {}) }),
  objection: {
    memo: 'm_20261108_4k2pqz' as MemoId,
    verdict: `${questId(n)}-${attempt - 1}` as Verdict['id'],
    judge,
  },
});

describe('memoCountsOf', () => {
  it('counts the memos filed by kind, and those sent to the owner, inside the window', () => {
    const events = [
      filed('m_20261108_aaaaaa', 'proposal', at(1)),
      routed('m_20261108_aaaaaa', 'chancellor', at(1)),
      filed('m_20261108_bbbbbb', 'objection', at(2)),
      routed('m_20261108_bbbbbb', 'judge', at(2)),
      filed('m_20261108_cccccc', 'objection', at(3)),
      routed('m_20261108_cccccc', 'owner', at(3, NEXT_DAY)),
      // A routing line whose filing line the log lost counts nowhere.
      routed('m_20261108_dddddd', 'owner', at(4)),
    ];
    expect(memoCountsOf(events, {})).toEqual([
      { kind: 'objection', filed: 2, to_owner: 1 },
      { kind: 'proposal', filed: 1, to_owner: 0 },
    ]);
    expect(memoCountsOf(events, { since: NEXT_DAY })).toEqual([{ kind: 'objection', filed: 0, to_owner: 1 }]);
  });
});

describe('objectionsOf', () => {
  it("counts each judge's verdicts a second judge answered, and those it overturned", () => {
    const verdicts = [
      answering(1, 2, 'pass', 'vesper'),
      answering(2, 2, 'fail', 'vesper'),
      answering(3, 2, 'pass', 'orin'),
      answering(4, 3, 'partial', 'orin'),
      answering(6, 2, 'fail', 'ilse'),
      answering(7, 2, 'fail', 'ilse'),
      answering(8, 2, 'fail', 'brann'),
      answering(9, 2, 'fail', 'brann'),
      verdictOf(5, 1, 'fail', { minute: 10, fail_kind: 'tests_fail' }),
    ];
    expect(objectionsOf(verdicts, {})).toEqual([
      { judge: 'vesper', answered: 2, overturned: 1 },
      { judge: 'orin', answered: 1, overturned: 1 },
      { judge: 'brann', answered: 2, overturned: 0 },
      { judge: 'ilse', answered: 2, overturned: 0 },
    ]);
    expect(objectionsOf(verdicts, { since: NEXT_DAY })).toEqual([]);
  });
});
