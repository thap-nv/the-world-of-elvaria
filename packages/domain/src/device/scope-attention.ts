// What a limited device sees of the owner's attention queue (P2-04, W6, ADR 0037): the items about its territories, the
// quests on them and the memos of those quests; closed when unsure, as scopeState is. An item that names no territory,
// quest or memo (a tribe held, a pool asleep, the Temple, an upgrade, a character, the kingdom's figures) is the whole
// kingdom's, which the device does not see; its command is the kingdom's too, refused to it (commandScopeOf).
import type { QuestId } from '../core/ids.ts';
import type { AttentionItem } from '../world/attention-table.ts';
import type { WorldState } from '../world/world-state.ts';
import type { Territories } from './scope-state.ts';

/** Every quest an item names, the quest of its memo included; undefined when its memo is not one the device sees. */
function questsOf(state: WorldState, item: AttentionItem): QuestId[] | undefined {
  const memo = item.memo === undefined ? undefined : state.memos[item.memo];
  if (item.memo !== undefined && (memo?.quest ?? null) === null) return undefined;
  const named = [
    item.quest,
    item.holder,
    item.target,
    item.merge_quest,
    item.attribution?.culprit,
    memo?.quest,
  ];
  return [
    ...named.filter((quest): quest is QuestId => quest !== undefined && quest !== null),
    ...(item.waiting ?? []),
    ...(item.suspects ?? []),
  ];
}

/**
 * True when the item is about the device's territories. A quest the state no longer holds (archived: merged, or the
 * suspect of a red branch) is vouched for by the item's own territory; without one it is outside.
 */
function inside(state: WorldState, item: AttentionItem, territories: Territories): boolean {
  const quests = questsOf(state, item);
  if (quests === undefined) return false;
  const where = (quest: QuestId) => state.quests[quest]?.territory ?? item.territory;
  const named = item.territory !== undefined || quests.length > 0;
  return (
    named &&
    (item.territory === undefined || territories.includes(item.territory)) &&
    quests.every((quest) => {
      const territory = where(quest);
      return territory !== undefined && territories.includes(territory);
    })
  );
}

/** The items of `items` that a device limited to `territories` receives, in their order. */
export const scopeAttention = (
  items: readonly AttentionItem[],
  state: WorldState,
  territories: Territories,
): AttentionItem[] => items.filter((item) => inside(state, item, territories));
