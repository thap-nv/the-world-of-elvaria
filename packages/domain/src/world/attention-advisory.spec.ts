// The digest and the Steward's advisory (PS-09c, ADR 0024): an open memo to quests is no item, since the quests it went
// to read it and nobody decides it; a memo of the Steward's on any other route is listed without a writer.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, MEMOS, TERRITORIES } from './__fixtures__/examples.ts';
import { ATTENTION_TABLE } from './attention-table.ts';
import { attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { MemoId } from '../core/ids.ts';

const NOW = Date.parse('2026-11-17T08:00:00+07:00') as Instant;
const ADVISORY = MEMOS.find(({ to }) => to.route === 'quests' && to.quests !== undefined);

describe('attentionQueue: the advisory (PS-09c)', () => {
  it('lists no advisory, and a memo of the Steward elsewhere without a writer', () => {
    if (ADVISORY === undefined) throw new Error('the examples have an advisory');
    const steward = { ...ADVISORY, id: 'm_20261117_aaaaa2' as MemoId, to: { route: 'chancellor' as const } };
    const source = {
      kingdom: KINGDOM,
      territories: TERRITORIES,
      characters: CHARACTERS,
      campaigns: CAMPAIGNS,
    };
    const state = worldStateOf({ ...source, quests: [], memos: [ADVISORY, steward] });
    expect(attentionQueue(state, NOW)).toEqual([
      {
        ...ATTENTION_TABLE.memo,
        kind: 'memo',
        command: ['memo', 'show', steward.id],
        memo: steward.id,
        memo_kind: 'advisory',
        quest: ADVISORY.quest,
      },
    ]);
  });
});
