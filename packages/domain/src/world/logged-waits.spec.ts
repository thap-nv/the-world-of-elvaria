// The Steward's notices as the log leaves them (P2-04): in force from their line until a line says they are gone or, for
// a quest, until a later line moves it; the owner's edit and another notice move nothing.
import { describe, expect, it } from 'vitest';

import {
  judgeWaitReasonsOf,
  judgeWaitsOf,
  tribeHoldsOf,
  unclaimableOf,
  waitGaugesOf,
} from './logged-waits.ts';
import { QUEST_CHANGE } from '../schema/event/__fixtures__/valid-data.ts';
import { EventSchema } from '../schema/event/event.ts';
import type { QuestId, TribeId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';

const Q1 = 'q_20261127_aaaaa1' as QuestId;
const Q2 = 'q_20261127_aaaaa2' as QuestId;
const GEMINI = 'gemini' as TribeId;

let serial = 0;
const line = (type: string, data: Record<string, unknown>, quest?: QuestId): Event => {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: `01JC${String(serial).padStart(22, '0')}`,
    ts: '2026-11-27T22:00:00+07:00',
    type,
    actor: { kind: 'steward' },
    ...(quest === undefined ? {} : { quest }),
    data,
  });
};

const unclaimable = (quest: QuestId, reason: string | null) =>
  line('quest.unclaimable', { reason, rank: 'D', class: 'knight' }, quest);
const judgeWait = (quest: QuestId, reason: string | null, gauges?: unknown[]) =>
  line('quest.judge_wait', { reason, ...(gauges === undefined ? {} : { gauges }) }, quest);
const moved = (type: string, quest: QuestId) => line(type, QUEST_CHANGE, quest);
const held = (version: string | null, checked = '1.5.1') =>
  line('tribe.held', { tribe: GEMINI, hold: { path: 'C:/agy/agy.exe', version, checked } });

describe('unclaimableOf', () => {
  it('keeps the last word about each quest, and forgets a quest once a line says the reason is gone', () => {
    const notes = unclaimableOf([
      unclaimable(Q1, 'no_class'),
      unclaimable(Q1, 'level_too_low'),
      unclaimable(Q2, 'no_class'),
      unclaimable(Q2, null),
    ]);
    expect([...notes]).toEqual([[Q1, { reason: 'level_too_low', rank: 'D', class: 'knight' }]]);
  });

  it('ends a notice at a later line that moves the quest, not at the owner’s edit nor at a line of no quest', () => {
    const edited = unclaimableOf([unclaimable(Q1, 'no_class'), moved('quest.edited', Q1), held('1.5.7')]);
    expect([...edited.keys()]).toEqual([Q1]);
    expect(unclaimableOf([unclaimable(Q1, 'no_class'), moved('quest.claimed', Q1)]).size).toBe(0);
  });
});

describe('judgeWaitsOf', () => {
  const gauges = [{ tribe: 'claude', pool: 'default', resets_at: '2026-11-27T23:00:00+07:00' }];

  it('keeps the latest reason of each quest, and its gauges', () => {
    const waits = judgeWaitsOf([judgeWait(Q1, 'unjudgeable'), judgeWait(Q1, 'judge_mana', gauges)]);
    expect([...waits]).toEqual([[Q1, { reason: 'judge_mana', gauges }]]);
  });

  it('forgets a wait at `reason: null`, and at a judge’s session or the owner’s cancel', () => {
    expect(judgeWaitsOf([judgeWait(Q1, 'unjudgeable'), judgeWait(Q1, null)]).size).toBe(0);
    expect(judgeWaitsOf([judgeWait(Q1, 'unjudgeable'), moved('quest.started', Q1)]).size).toBe(0);
    expect(judgeWaitsOf([judgeWait(Q1, 'judge_mana', gauges), moved('quest.archived', Q1)]).size).toBe(0);
  });

  it('keeps a wait through another quest’s move and the owner’s edit', () => {
    const waits = judgeWaitsOf([
      judgeWait(Q1, 'unjudgeable'),
      moved('quest.started', Q2),
      moved('quest.edited', Q1),
      unclaimable(Q1, 'no_class'),
    ]);
    expect([...waits.keys()]).toEqual([Q1]);
  });
});

describe('judgeWaitReasonsOf', () => {
  it('keeps the last reason a quest waited for since it last moved, through a pause of the wait', () => {
    const reasons = judgeWaitReasonsOf([
      judgeWait(Q1, 'unjudgeable'),
      judgeWait(Q1, 'judge_mana', [{ tribe: 'gemini', pool: 'gemini_models' }]),
      judgeWait(Q1, null),
      judgeWait(Q2, 'unjudgeable'),
      moved('quest.started', Q2),
    ]);
    expect([...reasons]).toEqual([[Q1, 'judge_mana']]);
  });
});

describe('waitGaugesOf', () => {
  it('gives the pools of a judge_mana line, a reset only where a reading said one, and none for another reason', () => {
    const gauges = [
      { tribe: 'claude', pool: 'default', resets_at: '2026-11-27T23:00:00+07:00' },
      { tribe: 'gemini', pool: 'gemini_models' },
    ];
    const [note] = judgeWaitsOf([judgeWait(Q1, 'judge_mana', gauges)]).values();
    expect(note === undefined ? undefined : waitGaugesOf(note)).toEqual(gauges);
    expect(waitGaugesOf({ reason: 'unjudgeable' })).toEqual([]);
  });
});

describe('tribeHoldsOf', () => {
  it('keeps the last hold of each tribe, and forgets it at `hold: null`', () => {
    expect([...tribeHoldsOf([held('1.5.7'), held(null), moved('quest.started', Q1)])]).toEqual([
      [GEMINI, { path: 'C:/agy/agy.exe', version: null, checked: '1.5.1' }],
    ]);
    const released = line('tribe.held', { tribe: GEMINI, hold: null });
    expect(tribeHoldsOf([held('1.5.7'), released]).size).toBe(0);
  });
});
