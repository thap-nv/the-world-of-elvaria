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
  resets_at: null,
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
      [pool('claude', 'claude', { asleep: true, resets_at: '2026-11-12T10:00:00+07:00' })],
    );
    const judgePool = { tribe: 'gemini' as TribeId, pool: 'gemini_models' };
    const items = attentionQueue(state, NOW, {
      unclaimable: [q(5)],
      unjudgeable: [{ quest: q(6), class: 'judge' }],
      judge_waits: [{ quest: q(7), class: 'judge', gauges: [judgePool] }],
      scope_held: [{ quest: q(8), waiting: [q(5)] }],
      tribes_held: [
        { tribe: 'gemini' as TribeId, path: 'C:/agy.exe', version: '1.5.8', checked: '1.5.6' },
        { tribe: 'codex' as TribeId, path: 'C:/codex.exe', version: undefined, checked: '0.167.0' },
        { tribe: 'claude' as TribeId, path: 'C:/claude.exe', version: '2.1.330', checked: '2.1.322' },
      ],
    });
    expect(items.map(({ group, kind, command }) => [group, kind, command.join(' ')])).toEqual([
      ['must', 'question', `answer ${q(1)} <answer>`],
      ['must', 'awaiting_seal', `seal ${q(2)}`],
      ['must', 'infirmary', `quest retry ${q(3)}`],
      ['must', 'judge_mana', `character add <id> --class judge --tribe <tribe>`],
      ['must', 'unjudgeable', `character add <id> --class judge --model <model>`],
      ['must', 'unclaimable', `quest show ${q(5)}`],
      ['must', 'scope_held', `quest archive ${q(8)}`],
      ['must', 'draft', `quest confirm ${q(4)}`],
      ['must', 'tribe_held', 'tribe check claude'],
      ['must', 'tribe_held', 'tribe check gemini'],
      ['must', 'tribe_gone', 'tribe check codex'],
      ['can_wait', 'memo', 'memo show m_20261112_4k2pqz'],
      ['can_wait', 'mana_asleep', 'wake claude'],
    ]);
    expect(items[9]).toMatchObject({ advice: 'check_tribe', version: '1.5.8', checked_version: '1.5.6' });
    expect(items[10]).toEqual({
      ...ATTENTION_TABLE.tribe_gone,
      kind: 'tribe_gone',
      command: ['tribe', 'check', 'codex'],
      tribe: 'codex',
      path: 'C:/codex.exe',
      checked_version: '0.167.0',
    });
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

  it('uses the sleep reset even after it passed, without borrowing a reading reset when unknown', () => {
    const resets_at = '2026-11-12T07:00:00+07:00';
    const state = stateWith(
      [],
      [],
      [
        pool('claude', 'claude', { asleep: true, resets_at }),
        pool('gemini', 'gemini_models', {
          asleep: true,
          readings: [reading(100, '2026-11-12T10:00:00+07:00')],
        }),
      ],
    );
    const items = attentionQueue(state, NOW);
    expect(items[0]?.resets_at).toBe(resets_at);
    expect(items[1]?.resets_at).toBeUndefined();
  });

  it('keeps the current reading reset on an awake pool warning', () => {
    const resets_at = '2026-11-12T10:00:00+07:00';
    const state = stateWith([], [], [pool('claude', 'claude', { readings: [reading(90, resets_at)] })]);
    expect(attentionQueue(state, NOW)[0]).toMatchObject({ kind: 'mana_warning', resets_at });
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

  it('lists a memo the triage sent up with its advice, before the memos it has not read (PS-03b)', () => {
    const merge = { action: 'merge', quest: q(3), holds: ['above_rank'] } satisfies MemoView['escalated'];
    const state = stateWith(
      [],
      [
        memo('m_20261112_aaaaaa'),
        { ...memo('m_20261112_zzzzzz'), escalated: merge },
        { ...memo('m_20261112_bbbbbb'), escalated: { action: 'owner', holds: ['chancellor_asks'] } },
      ],
    );
    const items = attentionQueue(state, NOW);
    expect(items.map(({ kind, memo: id }) => [kind, id])).toEqual([
      ['memo_escalated', 'm_20261112_bbbbbb'],
      ['memo_escalated', 'm_20261112_zzzzzz'],
      ['memo', 'm_20261112_aaaaaa'],
    ]);
    expect(items[1]).toMatchObject({
      group: 'can_wait',
      advice: 'weigh_triage',
      triage: 'merge',
      target: q(3),
      holds: ['above_rank'],
      command: ['memo', 'show', 'm_20261112_zzzzzz'],
    });
    expect(items[0]).not.toHaveProperty('target');
  });

  it('lists an objection no judge may read for the owner, and none on its way to a judge (PS-22)', () => {
    const objection = { ...memo('m_20261112_9tw3hx'), kind: 'objection' as MemoKindId, quest: q(1) };
    const state = stateWith(
      [],
      [
        { ...objection, route: 'owner' },
        { ...objection, id: 'm_20261112_4k2pqz' as MemoId, route: 'judge' },
        { ...memo('m_20261112_zzzzzz'), route: null },
      ],
    );
    expect(attentionQueue(state, NOW)).toEqual([
      {
        ...ATTENTION_TABLE.objection,
        kind: 'objection',
        command: ['memo', 'show', 'm_20261112_9tw3hx'],
        memo: 'm_20261112_9tw3hx',
        memo_kind: 'objection',
        from: 'thorn',
        quest: q(1),
      },
      {
        ...ATTENTION_TABLE.memo,
        kind: 'memo',
        command: ['memo', 'show', 'm_20261112_zzzzzz'],
        memo: 'm_20261112_zzzzzz',
        memo_kind: 'proposal',
        from: 'thorn',
      },
    ]);
  });

  it("lists an amendment as its blocked quest's question, else by where it stands (PS-22b)", () => {
    const amendment = { ...memo('m_20261112_aaaaa1'), kind: 'amendment' as MemoKindId };
    const blocked = view(1, { status: 'blocked', question: 'Step 2 is wrong.' });
    const state = stateWith(
      [blocked, view(2, { status: 'returned' })],
      [
        // Its quest is blocked on it: the question item stands for it, whoever decides.
        { ...amendment, quest: q(1), route: 'author' },
        {
          ...amendment,
          id: 'm_20261112_aaaaa2' as MemoId,
          quest: q(1),
          route: 'owner',
          refusal: 'no_author',
        },
        // Its quest moved on: its author still decides one, the owner the others.
        { ...amendment, id: 'm_20261112_aaaaa3' as MemoId, quest: q(2), route: 'author' },
        {
          ...amendment,
          id: 'm_20261112_aaaaa4' as MemoId,
          quest: q(2),
          route: 'author',
          escalated: { action: 'owner', holds: ['decision_change'] },
        },
        { ...amendment, id: 'm_20261112_aaaaa5' as MemoId, route: 'owner', refusal: 'second_amendment' },
      ],
    );
    expect(attentionQueue(state, NOW).map(({ kind, quest, memo: id }) => [kind, id ?? quest])).toEqual([
      ['question', q(1)],
      ['memo_escalated', 'm_20261112_aaaaa4'],
      ['memo', 'm_20261112_aaaaa5'],
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
