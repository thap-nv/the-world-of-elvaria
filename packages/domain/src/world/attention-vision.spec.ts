// The attention item of a quest that waits for a judge who reads images (PS-11): its own kind, right after the quest
// without a judge, advising a judge of a tribe whose CLI reads images instead of one on another model. Apart from
// attention.spec.ts, which is at its size limit.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, TERRITORIES } from './__fixtures__/examples.ts';
import { ATTENTION_KINDS, ATTENTION_TABLE } from './attention-table.ts';
import { attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';

const NOW = Date.parse('2026-11-15T08:00:00+07:00') as Instant;
const STATE = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: [],
  campaigns: CAMPAIGNS,
});
const q = (n: number): QuestId => `q_20261115_aaaaa${String(n)}` as QuestId;

describe('attentionQueue for a quest that waits for a judge who reads images', () => {
  it('advises a judge of a tribe that reads images, and the quest without a judge as before', () => {
    const items = attentionQueue(STATE, NOW, {
      unjudgeable: [
        { quest: q(1), class: 'judge', vision: true },
        { quest: q(2), class: 'judge', vision: false },
        { quest: q(3), class: 'judge' },
      ],
    });
    expect(items.map(({ kind, quest, advice, command }) => [kind, quest, advice, command.join(' ')])).toEqual(
      [
        ['unjudgeable', q(2), 'summon_judge', 'character add <id> --class judge --model <model>'],
        ['unjudgeable', q(3), 'summon_judge', 'character add <id> --class judge --model <model>'],
        [
          'unjudgeable_vision',
          q(1),
          'summon_judge_with_vision',
          'character add <id> --class judge --tribe <tribe>',
        ],
      ],
    );
    expect(items[2]).toMatchObject({ group: 'must', class: 'judge' });
  });

  it('lists it among the items the work waits on, right after the quest without a judge', () => {
    expect(ATTENTION_TABLE.unjudgeable_vision.group).toBe('must');
    expect(ATTENTION_KINDS.indexOf('unjudgeable_vision')).toBe(ATTENTION_KINDS.indexOf('unjudgeable') + 1);
  });
});
