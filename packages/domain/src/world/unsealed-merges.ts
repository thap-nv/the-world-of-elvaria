// The quests the Steward merged without the royal seal (implementation-plan §3.16.7, ADR 0023; PS-08b): each
// `delivery.merged` with `sealed: false` is one `can_wait` item of the next digest, with the pull request, the merge
// commit and the `git revert` line that undoes it. The owner runs that line and pushes it: the Steward never pushes the
// base branch. Read from the log, as the forge's outcomes are (forgeOutcomesOf): the quest is archived by then.
import { isEventOf } from '../schema/event/event.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { MergeMethod } from '../schema/territory-delivery.ts';

/** One merge without the seal, as its `delivery.merged` line tells it. */
export interface UnsealedMerge {
  readonly quest: QuestId;
  readonly territory: TerritoryId;
  readonly url: string;
  readonly merge_sha: string;
  readonly method: MergeMethod;
}

/**
 * The merges without the seal since the latest `digest.written` line, oldest first: the digest about to be written
 * names each of them, and the one after it no longer does.
 */
export function unsealedMergesOf(events: readonly Event[]): UnsealedMerge[] {
  const last = events.findLastIndex(({ type }) => type === 'digest.written');
  return events.slice(last + 1).flatMap((event) => {
    if (!isEventOf(event, 'delivery.merged') || event.data.sealed) return [];
    const { quest, territory, pr, merge_sha: sha, method } = event.data;
    return [{ quest, territory, url: pr.url, merge_sha: sha, method }];
  });
}

/**
 * The words that undo a merge on the base branch: a merge commit is reverted against its first parent, the base
 * branch as it was; a squashed commit has one parent.
 */
export const revertWordsOf = ({
  merge_sha: sha,
  method,
}: Pick<UnsealedMerge, 'merge_sha' | 'method'>): string[] =>
  method === 'merge' ? ['git', 'revert', '-m', '1', sha] : ['git', 'revert', sha];
