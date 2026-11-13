import { describe, expect, it } from 'vitest';

import { at, lineOf, questId } from './__fixtures__/ledger.ts';
import { amendmentCountsOf } from './amendment-counts.ts';
import { metricsOf } from './metrics-of.ts';

const NEXT_DAY = '2026-11-09';
const Q1 = questId(1);
const Q2 = questId(2);
const routed = (memo: string, to: Record<string, string>, ts: string, quest = Q1) =>
  lineOf('memo.routed', { memo, ...to }, ts, quest);
const closed = (memo: string, decision: string, ts: string, quest: string | undefined = Q1) =>
  lineOf('memo.closed', { memo, decision }, ts, quest);
const returned = (ts: string, quest = Q1) => lineOf('quest.returned', {}, ts, quest);

describe('amendmentCountsOf', () => {
  it('counts amendments by where they went and how they closed, never another memo', () => {
    const events = [
      routed('m_a', { route: 'author' }, at(1)),
      // Any other line about it counts nowhere.
      lineOf('memo.filed', { memo: 'm_a', kind: 'amendment', from: 'thorn' }, at(1), Q1),
      closed('m_a', 'accepted', at(2)),
      routed('m_b', { route: 'author' }, at(3)),
      lineOf('memo.escalated', { memo: 'm_b', action: 'owner', holds: ['decision_change'] }, at(4), Q1),
      routed('m_c', { route: 'owner', refusal: 'second_amendment' }, at(5)),
      closed('m_c', 'handled', at(6)),
      // An objection to the owner, and a proposal rejected, are no amendments.
      routed('m_d', { route: 'owner', refusal: 'final_verdict' }, at(7)),
      routed('m_e', { route: 'chancellor' }, at(8)),
      closed('m_e', 'rejected', at(9)),
      routed('m_f', { route: 'owner' }, at(10)),
    ];
    expect(amendmentCountsOf(events, {})).toEqual({
      filed: 3,
      accepted: 1,
      rejected: 0,
      to_owner: 2,
      returned_after_rejection: 0,
    });
  });

  it('counts a quest returned after its amendment was refused, once, inside the window', () => {
    const events = [
      returned(at(0)),
      routed('m_a', { route: 'author' }, at(1)),
      closed('m_a', 'rejected', at(2)),
      // Another quest's return is not this refusal's.
      returned(at(3), Q2),
      returned(at(4, NEXT_DAY)),
      returned(at(5, NEXT_DAY)),
      // A closing line that names no quest is counted, and returns nothing.
      routed('m_b', { route: 'author' }, at(6, NEXT_DAY), Q2),
      lineOf('memo.closed', { memo: 'm_b', decision: 'rejected' }, at(7, NEXT_DAY)),
      returned(at(8, NEXT_DAY), Q2),
    ];
    expect(amendmentCountsOf(events, {})).toEqual({
      filed: 2,
      accepted: 0,
      rejected: 2,
      to_owner: 0,
      returned_after_rejection: 1,
    });
    expect(amendmentCountsOf(events, { since: NEXT_DAY })).toMatchObject({
      filed: 1,
      rejected: 1,
      returned_after_rejection: 1,
    });
    expect(amendmentCountsOf(events, { until: '2026-11-08' })).toMatchObject({ returned_after_rejection: 0 });
  });

  it('is part of the metrics', () => {
    const metrics = metricsOf({
      quests: [],
      verdicts: [],
      events: [routed('m_a', { route: 'author' }, at(1))],
      commands: [],
    });
    expect(metrics.amendments.filed).toBe(1);
  });
});
