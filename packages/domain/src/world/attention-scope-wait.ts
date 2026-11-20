// The open quests that wait on a scope another quest holds, for the owner's digest: who they wait for and one glob of
// theirs that meets the holder's. The wait itself is scopeHolderOf's (dispatch/scope.ts), the same `quest list` says;
// this file only adds the glob, by asking scopesMeet of one entry at a time.
import { scopeHolderOf, scopeOf, scopesMeet, sharedGlobsOf } from '../dispatch/scope.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';

/** An open quest that waits for `holder` because their scopes meet, at `overlap`. */
export interface ScopeWaitNotice {
  readonly quest: QuestId;
  readonly holder: QuestId;
  /** The first glob of the waiting quest's scope, in its order, that meets the holder's scope. */
  readonly overlap: string;
}

/** The open quests that wait for a quest's scope (rule R3), as `quest list` says them; those of rule R2 are not here. */
export function scopeWaitNoticesOf(
  quests: readonly Quest[],
  territories: readonly Pick<Territory, 'id' | 'shared_paths'>[],
): ScopeWaitNotice[] {
  return quests.flatMap((quest) => {
    if (quest.status !== 'open') return [];
    const territory = territories.find(({ id }) => id === quest.territory);
    const wait = scopeHolderOf(quest, quests, territory);
    if (wait?.rule !== 'scope') return [];
    const held = quests.filter(({ id }) => id === wait.holder).flatMap(scopeOf);
    const shared = sharedGlobsOf(territory);
    // scopeHolderOf found the scopes meet, so some entry does; the first is named.
    const [overlap] = scopeOf(quest).filter((entry) => scopesMeet([entry], held, shared));
    return [{ quest: quest.id, holder: wait.holder, overlap: String(overlap) }];
  });
}
