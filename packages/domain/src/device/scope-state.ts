// What a limited device sees of the world (P2-01, W6, ADR 0037): its territories, their quests and the memos of those
// quests; every character (name, class, level, tribe, status) without the quest it holds outside them; the pools, the
// tribes and the mana thresholds of the whole kingdom, which say why work waits. Not the other territories and
// quests, campaigns, memos of no quest, or what the whole kingdom's digest and chronicle say.
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { CharacterView } from '../world/character-view.ts';
import type { WorldState } from '../world/world-state.ts';

/** The territories a scoped or inquiry device was given. */
export type Territories = readonly TerritoryId[];

/** True when `quest` is in `state` and on one of `territories`; a quest the state does not hold is outside (W6). */
export function questInside(state: WorldState, quest: QuestId | null, territories: Territories): boolean {
  const view = quest === null ? undefined : state.quests[quest];
  return view !== undefined && territories.includes(view.territory);
}

/** The character as the device sees it: the quest it holds is cleared when that quest is outside. */
export const maskedCharacter = (
  state: WorldState,
  character: CharacterView,
  territories: Territories,
): CharacterView =>
  character.current === null || questInside(state, character.current.quest, territories)
    ? character
    : { ...character, current: null };

/** The entries of a record of `state` that `keep` keeps, under the same key type. */
function kept<K extends string, V>(
  record: Readonly<Record<K, V>>,
  keep: (value: V) => boolean,
): Record<K, V> {
  const entries = Object.entries<V>(record).filter(([, value]) => keep(value));
  // fromEntries widens the keys to string; every key is one of `record`'s own.
  return Object.fromEntries(entries) as Record<K, V>;
}

function masked<K extends string>(
  record: Readonly<Record<K, CharacterView>>,
  mask: (character: CharacterView) => CharacterView,
): Record<K, CharacterView> {
  const entries = Object.entries<CharacterView>(record).map(([id, character]) => [id, mask(character)]);
  // fromEntries widens the keys to string; every key is one of `record`'s own.
  return Object.fromEntries(entries) as Record<K, CharacterView>;
}

/** `state` as a device limited to `territories` holds it. */
export function scopeState(state: WorldState, territories: Territories): WorldState {
  return {
    ...state,
    campaigns: [],
    territories: kept(state.territories, ({ id }) => territories.includes(id)),
    quests: kept(state.quests, ({ territory }) => territories.includes(territory)),
    memos: kept(state.memos, ({ quest }) => questInside(state, quest, territories)),
    characters: masked(state.characters, (character) => maskedCharacter(state, character, territories)),
  };
}
