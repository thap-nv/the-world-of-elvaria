// What a limited device receives of the owner's attention queue (P2-04, W6): the items of its territories, of their
// quests and of those quests' memos; nothing of the whole kingdom, and nothing it cannot place (closed when unsure).
import { describe, expect, it } from 'vitest';

import { itemOf } from '../world/attention-notices.ts';
import {
  AWAY,
  HOME,
  M_AWAY,
  M_HOME,
  M_LATER,
  M_LOOSE,
  Q_AWAY,
  Q_HOME,
  Q_LATER,
  WORLD,
} from './__fixtures__/world.ts';
import { scopeAttention } from './scope-attention.ts';
import type { TribeId } from '../core/ids.ts';
import type { AttentionItem } from '../world/attention-table.ts';

const kept = (items: readonly AttentionItem[]): AttentionItem[] => scopeAttention(items, WORLD, [HOME]);

describe('scopeAttention', () => {
  it('keeps the items of a quest, a memo and a territory of the device', () => {
    const items = [
      itemOf('awaiting_seal', { quest: Q_HOME.id }),
      itemOf('memo', { memo: M_HOME.id }),
      itemOf('base_red', { territory: HOME, suspects: [Q_LATER], waiting: [Q_HOME.id] }),
      itemOf('scope_wait', { quest: Q_HOME.id, holder: Q_HOME.id }),
    ];
    expect(kept(items)).toEqual(items);
  });

  it('drops the items of another territory, of its quests and of their memos', () => {
    expect(
      kept([
        itemOf('awaiting_seal', { quest: Q_AWAY.id }),
        itemOf('memo', { memo: M_AWAY.id }),
        itemOf('base_red', { territory: AWAY }),
        itemOf('delivery_merging', { quest: Q_HOME.id, merge_quest: Q_AWAY.id }),
        itemOf('base_red', { territory: HOME, attribution: { cause: 'own_change', culprit: Q_AWAY.id } }),
      ]),
    ).toEqual([]);
  });

  it('drops what it cannot place: the whole kingdom’s items, a memo of no quest, a quest it no longer holds', () => {
    expect(
      kept([
        itemOf('tribe_held', { tribe: 'gemini' as TribeId }),
        itemOf('upgrade_available', { pinned: 'a', latest: 'b', commits: 1 }),
        itemOf('memo', { memo: M_LOOSE.id }),
        itemOf('memo', { memo: M_LATER.id }),
        itemOf('unclaimable', { quest: Q_LATER }),
      ]),
    ).toEqual([]);
  });

  it('lets the item’s own territory vouch for a quest the state no longer holds', () => {
    const merged = itemOf('merged_unsealed', { quest: Q_LATER, territory: HOME });
    expect(kept([merged])).toEqual([merged]);
    expect(scopeAttention([merged], WORLD, [AWAY])).toEqual([]);
  });
});
