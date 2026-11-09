// What a quest's plot is built on (implementation-plan §3.3, §3.13; P1-18): the branches of other quests it must
// contain, decided from the quests alone; runner-core's PlotManager asks git which of them the default branch
// already holds. A part starts from the contract's branch, so every member of a party sees the same contract; the
// merge quest starts there too and gets every part merged in, the blind trial's acceptance part among them, which
// starts on the contract's branch alone (P1-21). Any other quest starts from the branch of a dependency
// done but not merged yet (P1-16 proposal (f): two chained sub-quests editing one file no longer fork from the same
// main and conflict when the owner merges the second).
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

export interface PlotBase {
  /**
   * Branches the plot may start from, best first: the first one that exists and the default branch does not hold yet
   * wins; none of them, the default branch (§3.3). Only read when the worktree is made.
   */
  readonly from: readonly string[];
  /** Branches merged into the plot before each session, each one unless it is in already: a merge quest's parts. */
  readonly merge: readonly string[];
}

/** The branch of quest `id` when it has a worktree on the quest's own territory; none for any other plot. */
function branchesOf(quest: Quest, ids: readonly QuestId[], quests: readonly Quest[]): string[] {
  return ids.flatMap((id) => {
    const other = quests.find((candidate) => candidate.id === id);
    if (other?.territory !== quest.territory || other.plot.type !== 'worktree') return [];
    return other.plot.branch === undefined ? [] : [other.plot.branch];
  });
}

/**
 * The base of `quest`'s plot among `quests` (all quests of the kingdom will do). A part prefers the branch of a part
 * it depends on, which holds the contract already, over the contract's own; a dependency of another territory, or
 * without a worktree, gives nothing to start from.
 */
export function plotBaseOf(quest: Quest, quests: readonly Quest[]): PlotBase {
  const party = quest.party_id;
  if (party === undefined || quest.party_role === 'contract')
    return { from: branchesOf(quest, quest.depends_on, quests), merge: [] };
  const contract = branchesOf(quest, [party], quests);
  if (quest.party_role === 'merge')
    return { from: contract, merge: branchesOf(quest, quest.depends_on, quests) };
  // The blind trial's acceptance part (§3.15, P1-21): the contract and nothing of the parts' work, whatever it waits for.
  if (quest.party_role === 'acceptance') return { from: contract, merge: [] };
  const others = quest.depends_on.filter((id) => id !== party);
  return { from: [...branchesOf(quest, others, quests), ...contract], merge: [] };
}
