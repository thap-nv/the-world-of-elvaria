// The digest's held quests ((D) of fix/quest-hold): one `quest_held` (can wait) for each quest the owner holds, with
// why when the owner said; the command lifts the hold.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, QUESTS, TERRITORIES } from './__fixtures__/examples.ts';
import { ATTENTION_TABLE } from './attention-table.ts';
import { attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';

const NOW = Date.parse('2026-11-18T08:00:00+07:00') as Instant;
const QUEST = QUESTS.find(({ status }) => status === 'open') ?? QUESTS[0]!;
const GONE = 'q_20261118_aaaaa9' as QuestId;
const state = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: [QUEST],
  memos: [],
  campaigns: CAMPAIGNS,
});
const heldItems = (held: Parameters<typeof attentionQueue>[2]) =>
  attentionQueue(state, NOW, held).filter(({ kind }) => kind === 'quest_held');

describe('attentionQueue: the held quests ((D) of fix/quest-hold)', () => {
  it('names each held quest, with the reason the owner gave, and the command that lifts the hold', () => {
    const items = heldItems({ held: [{ quest: QUEST.id, reason: 'Waits for PS-09d.' }, { quest: GONE }] });
    expect(items).toEqual([
      {
        ...ATTENTION_TABLE.quest_held,
        kind: 'quest_held',
        command: ['quest', 'unhold', QUEST.id],
        quest: QUEST.id,
        title: QUEST.title,
        rank: QUEST.rank,
        held_reason: 'Waits for PS-09d.',
      },
      { ...ATTENTION_TABLE.quest_held, kind: 'quest_held', command: ['quest', 'unhold', GONE], quest: GONE },
    ]);
    expect(items.every(({ group }) => group === 'can_wait')).toBe(true);
  });

  it('has none without held quests', () => {
    expect(heldItems({})).toEqual([]);
  });
});
