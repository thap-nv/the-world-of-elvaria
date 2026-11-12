import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, QUEST_VIEW, TERRITORIES } from './__fixtures__/examples.ts';
import { ATTENTION_TABLE, attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, MemoId, MemoKindId, QuestId, TribeId } from '../core/ids.ts';
import type { MemoView } from './memo-view.ts';
import type { PoolView } from './mana-view.ts';
import type { QuestView } from './quest-view.ts';
import type { WorldState } from './world-state.ts';

const NOW = Date.parse('2026-11-12T08:00:00+07:00') as Instant;
const BASE = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: [],
  campaigns: CAMPAIGNS,
});

const q = (n: number): QuestId => `q_20261112_aaaaa${String(n)}` as QuestId;
const view = (n: number, change: Partial<QuestView>): QuestView => ({
  ...QUEST_VIEW,
  id: q(n),
  title: `Quest ${String(n)}`,
  question: null,
  ...change,
});
const memo = (id: string): MemoView => ({
  id: id as MemoId,
  kind: 'proposal' as MemoKindId,
  from: 'thorn' as CharacterId,
  quest: null,
  route: 'chancellor',
});
const pool = (tribe: string, name: string, change: Partial<PoolView> = {}): PoolView => ({
  tribe: tribe as TribeId,
  pool: name,
  asleep: false,
  readings: [],
  ...change,
});
const reading = (used: number, resets: string | null) => ({
  window: 'five_hour' as const,
  used_pct: used,
  resets_at: resets,
  source: 'rate_limits' as const,
  observed_at: '2026-11-12T07:00:00+07:00',
});

function stateWith(
  quests: readonly QuestView[],
  memos: readonly MemoView[] = [],
  pools: readonly PoolView[] = [],
): WorldState {
  return {
    ...BASE,
    quests: Object.fromEntries(quests.map((quest) => [quest.id, quest])),
    memos: Object.fromEntries(memos.map((entry) => [entry.id, entry])),
    pools: [...pools],
  };
}

describe('attentionQueue', () => {
  it('lists a day in two groups, the work that waits first, every item with its advice and command', () => {
    const state = stateWith(
      [
        view(1, { status: 'blocked', question: 'Which locale for dates?' }),
        view(2, { status: 'awaiting_seal' }),
        view(3, { status: 'infirmary' }),
        view(4, { status: 'draft' }),
        view(5, { status: 'open' }),
        view(6, { status: 'working' }),
      ],
      [memo('m_20261112_4k2pqz')],
      [pool('claude', 'claude', { asleep: true, readings: [reading(100, '2026-11-12T10:00:00+07:00')] })],
    );
    const judgePool = { tribe: 'gemini' as TribeId, pool: 'gemini_models' };
    const items = attentionQueue(state, NOW, {
      unclaimable: [q(5)],
      unjudgeable: [{ quest: q(6), class: 'judge' }],
      judge_waits: [{ quest: q(7), class: 'judge', gauges: [judgePool] }],
    });
    expect(items.map(({ group, kind, command }) => [group, kind, command.join(' ')])).toEqual([
      ['must', 'question', `answer ${q(1)} <answer>`],
      ['must', 'awaiting_seal', `seal ${q(2)}`],
      ['must', 'infirmary', `quest retry ${q(3)}`],
      ['must', 'judge_mana', `character add <id> --class judge --tribe <tribe>`],
      ['must', 'unjudgeable', `character add <id> --class judge --model <model>`],
      ['must', 'unclaimable', `quest show ${q(5)}`],
      ['must', 'draft', `quest confirm ${q(4)}`],
      ['can_wait', 'memo', 'memo show m_20261112_4k2pqz'],
      ['can_wait', 'mana_asleep', 'wake claude'],
    ]);
    expect(items[0]).toMatchObject({
      advice: 'answer',
      title: 'Quest 1',
      question: 'Which locale for dates?',
    });
    // A quest the state no longer holds keeps its id; the gauges of a judge wait come with it.
    expect(items[3]).toEqual({
      ...ATTENTION_TABLE.judge_mana,
      kind: 'judge_mana',
      command: ['character', 'add', '<id>', '--class', 'judge', '--tribe', '<tribe>'],
      quest: q(7),
      class: 'judge',
      gauges: [judgePool],
    });
    expect(items.at(-1)).toMatchObject({
      tribe: 'claude',
      pool: 'claude',
      resets_at: '2026-11-12T10:00:00+07:00',
    });
  });

  it('is empty for a kingdom with nothing waiting', () => {
    expect(attentionQueue(stateWith([view(1, { status: 'working' })]), NOW)).toEqual([]);
  });

  it('puts higher ranks first within a kind, then ids; memos by id, with their quest when known', () => {
    const state = stateWith(
      [view(2, { status: 'awaiting_seal', rank: 'D' }), view(1, { status: 'awaiting_seal', rank: 'B' })],
      [memo('m_20261112_zzzzzz'), { ...memo('m_20261112_4k2pqz'), quest: q(1) }],
    );
    expect(attentionQueue(state, NOW).map((item) => item.quest ?? item.memo)).toEqual([
      q(1),
      q(2),
      q(1),
      'm_20261112_zzzzzz',
    ]);
  });

  it('warns of a pool at the warning share, from current readings of enabled tribes only', () => {
    // Warning from 88 % (cap 98, reserve 2, margin 10).
    const state = stateWith(
      [],
      [],
      [
        pool('claude', 'claude', { readings: [reading(90, null)] }),
        pool('gemini', 'gemini_models', { readings: [reading(95, '2026-11-12T07:00:00+07:00')] }),
        pool('gemini', 'claude_gpt_models', { readings: [reading(40, null)] }),
        pool('codex', 'codex', { asleep: true }),
        pool('gemini', 'other', { asleep: true }),
        pool('gemini', 'another', { asleep: true }),
      ],
    );
    const asleep = { ...ATTENTION_TABLE.mana_asleep, kind: 'mana_asleep', command: ['wake', 'gemini'] };
    expect(attentionQueue(state, NOW)).toEqual([
      { ...asleep, tribe: 'gemini', pool: 'another' },
      { ...asleep, tribe: 'gemini', pool: 'other' },
      {
        ...ATTENTION_TABLE.mana_warning,
        kind: 'mana_warning',
        tribe: 'claude',
        pool: 'claude',
        used_pct: 90,
      },
    ]);
  });
});
