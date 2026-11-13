import { describe, expect, it } from 'vitest';

import { at, lineOf, questId } from './__fixtures__/ledger.ts';
import { adviceOf } from './advice.ts';
import type { Event } from '../schema/event/event.ts';

const memo = (n: number): string => `m_20261108_${String(n).padStart(6, 'a')}`;

const escalated = (n: number, action: string, minute: number): Event =>
  lineOf('memo.escalated', { memo: memo(n), action, holds: ['above_rank'] }, at(minute), questId(1));

const closed = (
  n: number,
  decision: string,
  minute: number,
  actor: Event['actor'] = { kind: 'user' },
): Event => ({
  ...lineOf('memo.closed', { memo: memo(n), decision }, at(minute), questId(1)),
  actor,
});

/**
 * Six memos sent up: 1 merge, handled; 2 new quest, shelved; 3 shelve, shelved; 4 for the owner, rejected; 5 merge,
 * still open; 6 shelve, decided the next day. Memo 7 was never sent up; memo 8 the triage closed itself.
 */
const LOG = [
  escalated(1, 'merge', 0),
  escalated(2, 'new_quest', 0),
  escalated(3, 'shelve', 0),
  escalated(4, 'owner', 0),
  escalated(5, 'merge', 0),
  escalated(6, 'shelve', 0),
  escalated(8, 'shelve', 0),
  closed(1, 'handled', 10),
  closed(2, 'shelved', 10),
  closed(3, 'shelved', 10),
  closed(4, 'rejected', 10),
  closed(7, 'handled', 10),
  closed(8, 'shelved', 10, { kind: 'chancellor' }),
  { ...closed(6, 'shelved', 0), ts: '2026-11-09T07:00:00+07:00' },
];

describe('adviceOf (PS-06b)', () => {
  it("sets the Chancellor's advice beside the owner's decision, the memos it left to the owner aside", () => {
    expect(adviceOf(LOG, { until: '2026-11-08' })).toEqual({
      escalated: 7,
      decided: 3,
      followed: 2,
      by_action: [
        { action: 'merge', escalated: 2, decided: 1, followed: 1 },
        { action: 'new_quest', escalated: 1, decided: 1, followed: 0 },
        { action: 'shelve', escalated: 3, decided: 1, followed: 1 },
        { action: 'owner', escalated: 1, decided: 1, followed: 0 },
      ],
    });
  });

  it('counts a decision on its day, though the advice came the day before', () => {
    expect(adviceOf(LOG, { since: '2026-11-09' })).toEqual({
      escalated: 0,
      decided: 1,
      followed: 1,
      by_action: [{ action: 'shelve', escalated: 0, decided: 1, followed: 1 }],
    });
  });

  it('is empty on a log with no memo sent up', () => {
    expect(adviceOf([closed(1, 'handled', 0)], {})).toEqual({
      escalated: 0,
      decided: 0,
      followed: 0,
      by_action: [],
    });
  });
});
