// The digest under the breaker of the seal delegation (PS-08g): a territory whose delegation is suspended is one item
// that can wait (the work goes on, every new quest there waits for the seal), with why, since when, the quest it
// blames, and the command that resumes it.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, QUESTS, TERRITORIES } from './__fixtures__/examples.ts';
import { attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';

const NOW = Date.parse('2026-11-18T08:00:00+07:00') as Instant;
const KNOWN = QUESTS[0]!;
const GONE = 'q_20261118_ccccc9' as QuestId;
const TERRITORY = 'elvaria' as TerritoryId;
const OTHER = 'docs-site' as TerritoryId;
const SINCE = '2026-11-18T06:30:00+07:00';

const state = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: QUESTS,
  campaigns: CAMPAIGNS,
  memos: [],
});

describe('attentionQueue: delegation_suspended', () => {
  it('one item per suspended territory, in the can_wait group, with the command that resumes it', () => {
    const items = attentionQueue(state, NOW, {
      delegation_suspended: [
        { territory: TERRITORY, quest: KNOWN.id, cause: 'base_red', check: 'unit', since: SINCE },
        { territory: OTHER, quest: GONE, cause: 'escape_reported', note: 'the menu broke', since: SINCE },
      ],
    }).filter(({ kind }) => kind === 'delegation_suspended');
    expect(items).toEqual([
      {
        kind: 'delegation_suspended',
        group: 'can_wait',
        advice: 'read_then_resume',
        command: ['territory', 'delegation', 'elvaria', '--resume'],
        quest: KNOWN.id,
        title: KNOWN.title,
        rank: KNOWN.rank,
        territory: 'elvaria',
        cause: 'base_red',
        since: SINCE,
        check: 'unit',
      },
      {
        kind: 'delegation_suspended',
        group: 'can_wait',
        advice: 'read_then_resume',
        command: ['territory', 'delegation', 'docs-site', '--resume'],
        quest: GONE,
        territory: 'docs-site',
        cause: 'escape_reported',
        since: SINCE,
        note: 'the menu broke',
      },
    ]);
  });

  it('no item without a suspension', () => {
    const kinds = attentionQueue(state, NOW, { delegation_suspended: [] }).map(({ kind }) => kind);
    expect(kinds).not.toContain('delegation_suspended');
  });
});
