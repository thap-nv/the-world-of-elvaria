// Which done quests the Steward delivers to their territory's forge (implementation-plan §3.16.7, ADR 0023; PS-08c):
// after `done.deliver` wrote the delivery note, it pushes quest/<id> and opens its pull request, outside the tick.
// A party's contract, parts and acceptance part reach the base branch through the merge quest (ADR 0020), so only the
// merge quest of a party goes. One delivery runs at a time on a territory, highest rank first (byPriority): PS-09's
// queue takes over from there. A quest whose delivery has an outcome (forgeOutcomesOf: pushed, merged, failed; or a
// branch the Steward found with nothing to push) is settled: a failure is never tried again on its own, only by the
// owner's `deliver` command, which forgets the outcome. (PS-08d) A quest whose branch is in the base branch already
// (merged by hand) is archived instead, and a sealed quest's pull request under `pr_merge` is merged (mergeDue).
import { deliveryOf } from '../schema/territory-delivery.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';
import type { BackgroundWork } from './reviews.ts';

/** A quest that may go to its forge, the outcome aside: `done`, delivered, on a branch, its territory not manual. */
export function forgeDue(quest: Quest, territory: Pick<Territory, 'delivery'> | undefined): boolean {
  if (territory === undefined || deliveryOf(territory).mode === 'manual') return false;
  if (quest.status !== 'done' || quest.deliverable.delivered_at === undefined) return false;
  if (quest.plot.type !== 'worktree' || quest.plot.branch === undefined) return false;
  return quest.party_role === undefined || quest.party_role === 'merge';
}

/**
 * Rule (G) of the PS-08 plan (PS-08d): under `pr_merge` the Steward merges the pull request of a quest that has the
 * royal seal; one done without it stops at its pull request, as under `pr`, until delegation of the seal (PS-08b
 * widens this function and nothing else).
 */
export function mergeDue(quest: Quest, territory: Pick<Territory, 'delivery'> | undefined): boolean {
  if (territory === undefined || !forgeDue(quest, territory)) return false;
  return deliveryOf(territory).mode === 'pr_merge' && quest.seal !== undefined;
}

/** What forgeDeliveries reads of the snapshot. */
export interface ForgeSource {
  readonly territories: readonly (Pick<Territory, 'delivery'> & { readonly id: TerritoryId })[];
  readonly background?: BackgroundWork;
  /** Done quests whose delivery has an outcome (forgeOutcomesOf), or nothing to push. Absent: none. */
  readonly forge?: readonly QuestId[];
  /** Done quests whose branch is in the base branch already (PS-08d, forgeArchives): archived, never pushed. */
  readonly in_base?: readonly QuestId[];
}

/**
 * The deliveries that start now, from `done` (best first): one per territory, none on a territory whose delivery
 * still runs. A done quest's work in the background is its delivery: checks and scripts leave with `review` and
 * `working` (wantedIn).
 */
export function forgeDeliveries(source: ForgeSource, done: readonly Quest[]): QuestId[] {
  const settled = new Set([...(source.forge ?? []), ...(source.in_base ?? [])]);
  const running = new Set(source.background?.running);
  const territories = new Map(source.territories.map((territory) => [territory.id, territory]));
  const busy = new Set(done.filter(({ id }) => running.has(id)).map(({ territory }) => territory));
  const picked: QuestId[] = [];
  for (const quest of done) {
    if (busy.has(quest.territory) || settled.has(quest.id)) continue;
    if (!forgeDue(quest, territories.get(quest.territory))) continue;
    busy.add(quest.territory);
    picked.push(quest.id);
  }
  return picked;
}
