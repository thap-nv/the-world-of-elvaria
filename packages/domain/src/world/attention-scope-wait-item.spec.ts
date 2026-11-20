// The digest's scope waits: one `scope_wait` (can wait) for each open quest that waits for a quest's scope, naming the
// quest it waits for and the glob where the scopes meet; the command shows why.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, QUESTS, TERRITORIES } from './__fixtures__/examples.ts';
import { attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';

const NOW = Date.parse('2026-11-18T08:00:00+07:00') as Instant;
const QUEST = QUESTS.find(({ status }) => status === 'open') ?? QUESTS[0]!;
const HOLDER = 'q_20261118_aaaaa9' as QuestId;
const state = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: [QUEST],
  memos: [],
  campaigns: CAMPAIGNS,
});

describe('attentionQueue: the scope waits', () => {
  it('names the quest an open quest waits for and where the scopes meet, in the can-wait group', () => {
    const items = attentionQueue(state, NOW, {
      scope_waits: [{ quest: QUEST.id, holder: HOLDER, overlap: 'packages/domain/**' }],
    }).filter(({ kind }) => kind === 'scope_wait');
    expect(items).toMatchObject([
      {
        group: 'can_wait',
        advice: 'wait_for_scope',
        command: ['quest', 'show', QUEST.id],
        quest: QUEST.id,
        title: QUEST.title,
        holder: HOLDER,
        overlap: 'packages/domain/**',
      },
    ]);
  });
});
