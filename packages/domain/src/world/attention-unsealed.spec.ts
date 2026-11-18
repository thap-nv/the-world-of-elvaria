// The digest under the delegation of the seal (PS-08b, ADR 0023): each merge without the seal since the last digest
// is one item that can wait, with the `git revert` line that undoes it; a quest whose seal the machine raised says why.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, QUESTS, TERRITORIES } from './__fixtures__/examples.ts';
import { attentionQueue } from './attention.ts';
import { questViewOf } from './quest-view.ts';
import { revertWordsOf, unsealedMergesOf } from './unsealed-merges.ts';
import { worldStateOf } from './world-state.ts';
import { EventSchema } from '../schema/event/event.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { Quest } from '../schema/quest/quest.ts';

const NOW = Date.parse('2026-11-18T08:00:00+07:00') as Instant;
const Q1 = 'q_20261118_aaaaa1' as QuestId;
const Q2 = 'q_20261118_aaaaa2' as QuestId;
const TERRITORY = TERRITORIES[0]?.id ?? ('' as TerritoryId);
const SHA = 'b'.repeat(40);
const URL = 'https://github.com/o/r/pull/7';

let serial = 0;
const line = (type: string, data: Record<string, unknown>, quest?: QuestId): Event => {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: `01JD${String(serial).padStart(22, '0')}`,
    ts: '2026-11-18T07:00:00+07:00',
    type,
    actor: { kind: 'steward' },
    ...(quest === undefined ? {} : { quest }),
    data,
  });
};
const merged = (quest: QuestId, sealed: boolean, method = 'merge') =>
  line(
    'delivery.merged',
    {
      quest,
      territory: TERRITORY,
      branch: `quest/${quest}`,
      head: 'a'.repeat(40),
      pr: { number: 7, url: URL },
      merge_sha: SHA,
      method,
      sealed,
      branch_deleted: true,
    },
    quest,
  );
const digest = line('digest.written', {
  day: '2026-11-17',
  file: 'digest/2026-11-17.md',
  must: 0,
  can_wait: 0,
});

describe('unsealedMergesOf', () => {
  it('reads the merges without the seal since the last digest, and none before it', () => {
    const events = [merged(Q2, false), digest, merged(Q1, false), merged(Q2, true)];
    expect(unsealedMergesOf(events)).toEqual([
      { quest: Q1, territory: TERRITORY, url: URL, merge_sha: SHA, method: 'merge' },
    ]);
  });

  it('reads the whole log before the first digest', () => {
    expect(unsealedMergesOf([merged(Q1, false, 'squash')]).map(({ method }) => method)).toEqual(['squash']);
  });
});

describe('revertWordsOf', () => {
  it('reverts a merge commit against its first parent, a squashed commit as it is', () => {
    expect(revertWordsOf({ merge_sha: SHA, method: 'merge' })).toEqual(['git', 'revert', '-m', '1', SHA]);
    expect(revertWordsOf({ merge_sha: SHA, method: 'squash' })).toEqual(['git', 'revert', SHA]);
  });
});

const stateOf = (quests: readonly Quest[]) =>
  worldStateOf({
    kingdom: KINGDOM,
    territories: TERRITORIES,
    characters: CHARACTERS,
    quests,
    campaigns: CAMPAIGNS,
  });

describe('attentionQueue under the delegation of the seal', () => {
  it('lists a merge without the seal in the group that can wait, with its pull request and its undo line', () => {
    const merge = { quest: Q1, territory: TERRITORY, url: URL, merge_sha: SHA, method: 'merge' } as const;
    expect(attentionQueue(stateOf([]), NOW, { merged_unsealed: [merge] })).toEqual([
      {
        kind: 'merged_unsealed',
        group: 'can_wait',
        advice: 'read_or_revert',
        command: ['quest', 'show', Q1],
        quest: Q1,
        territory: TERRITORY,
        url: URL,
        commit: SHA,
        revert: ['git', 'revert', '-m', '1', SHA],
      },
    ]);
  });

  it('names why the machine raised the seal of a quest that waits for it, and nothing for any other', () => {
    const spared = { ...QUESTS[0]!, status: 'awaiting_seal', seal_required: true } as const;
    const raised: Quest = {
      ...spared,
      id: Q1,
      seal_delegated: true,
      seal_raised: ['diff_size', 'objection'],
    };
    const plain: Quest = { ...spared, id: Q2 };
    const items = attentionQueue(stateOf([raised, plain]), NOW);
    expect(items.map(({ quest, raised: why }) => ({ quest, why }))).toEqual([
      { quest: Q1, why: ['diff_size', 'objection'] },
      { quest: Q2, why: undefined },
    ]);
  });
});

describe('questViewOf', () => {
  it('carries the reasons the machine raised, and leaves the field out without one', () => {
    expect(questViewOf({ ...QUESTS[0]!, seal_raised: ['machine_judge'] }).seal_raised).toEqual([
      'machine_judge',
    ]);
    expect('seal_raised' in questViewOf(QUESTS[0]!)).toBe(false);
  });
});
