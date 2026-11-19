// (PS-12c) A temple letter for a stronger model goes straight to the owner: the queue lists it as a memo to decide, not
// as an objection no judge may read, which also goes to the owner but says why (its refusal).
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, TERRITORIES } from './__fixtures__/examples.ts';
import { ATTENTION_TABLE } from './attention-table.ts';
import { attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, MemoId, MemoKindId, QuestId } from '../core/ids.ts';
import type { MemoView } from './memo-view.ts';

const NOW = Date.parse('2026-11-19T08:00:00+07:00') as Instant;
const QUEST = 'q_20261118_aaaaaa' as QuestId;
const BASE = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: [],
  campaigns: CAMPAIGNS,
});

const letter = (id: string, route: MemoView['route'], refusal?: MemoView['refusal']): MemoView => ({
  id: id as MemoId,
  kind: 'proposal' as MemoKindId,
  from: 'sage' as CharacterId,
  quest: QUEST,
  route,
  ...(refusal === undefined ? {} : { refusal }),
});

const itemOf = (kind: 'memo' | 'objection', id: string) => ({
  ...ATTENTION_TABLE[kind],
  kind,
  command: ['memo', 'show', id],
  memo: id,
  memo_kind: 'proposal',
  from: 'sage',
  quest: QUEST,
});

describe('attentionQueue: the letters of the temple', () => {
  it('lists a letter to the owner as a memo, and an objection the owner settles as an objection', () => {
    const memos = [
      letter('m_20261118_4k2pqz', 'owner'),
      letter('m_20261118_9tw3hx', 'chancellor'),
      letter('m_20261118_x4y5z6', 'owner', 'no_verdict'),
    ];
    const state = { ...BASE, memos: Object.fromEntries(memos.map((memo) => [memo.id, memo])) };
    expect(attentionQueue(state, NOW)).toEqual([
      itemOf('objection', 'm_20261118_x4y5z6'),
      itemOf('memo', 'm_20261118_4k2pqz'),
      itemOf('memo', 'm_20261118_9tw3hx'),
    ]);
  });
});
