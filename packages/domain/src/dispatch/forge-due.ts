// Which done quests the Steward delivers to their territory's forge (implementation-plan §3.16.7, ADR 0023; PS-08c):
// after `done.deliver` wrote the delivery note, it pushes quest/<id> and opens its pull request, outside the tick.
// A party's contract, parts and acceptance part reach the base branch through the merge quest (ADR 0020), so only the
// merge quest of a party goes. One delivery runs at a time on a territory: the merge queue (PS-09) takes first the
// quest that touched the fewest hot files (shared_paths), then the fewest files, then the highest rank (byPriority),
// so small work reaches the base branch before the work that will have to meet it. A pull request open whose branch
// no longer merges cleanly (a look at the base branch, or the forge's conflict) is due again, ahead of the others, up
// to UPDATE_ROUNDS_MAX times per delivery. A sealed quest's pull request that the Steward merges itself (mergeDue)
// holds its territory's lane until it is merged or fails: the next quest is updated on top of it, so the checks the
// queue ran are those of the very tree the forge merges (K16). A quest whose delivery has an outcome (forgeOutcomesOf: pushed, merged, failed; or a
// branch the Steward found with nothing to push) is settled: a failure is never tried again on its own, only by the
// owner's `deliver` command, which forgets the outcome. (PS-08d) A quest whose branch is in the base branch already
// (merged by hand) is archived instead, and a sealed quest's pull request under `pr_merge` is merged (mergeDue); (PS-08b)
// so is one the delegation of the seal still covers (mayMergeUnsealed).
import { UPDATE_ROUNDS_MAX } from './constants.ts';
import { mayMergeUnsealed } from '../delegation/seal.ts';
import { stoppedByBase } from '../patrol/base-red.ts';
import { deliveryOf } from '../schema/territory-delivery.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { SealPolicy } from '../delegation/seal.ts';
import type { BaseRed } from '../patrol/base-red.ts';
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
 * royal seal; (PS-08b) or that the delegation of the seal still covers (mayMergeUnsealed, `policy`). One done without
 * the seal for another reason (its kind's seal_default, the owner's `--no-seal`) stops at its pull request, as under
 * `pr`.
 */
export function mergeDue(
  quest: Quest,
  territory: Pick<Territory, 'delivery'> | undefined,
  policy: SealPolicy = {},
): boolean {
  if (territory === undefined || !forgeDue(quest, territory)) return false;
  if (deliveryOf(territory).mode !== 'pr_merge') return false;
  return quest.seal !== undefined || mayMergeUnsealed(quest, territory, policy);
}

/** What forgeDeliveries reads of the snapshot. */
export interface ForgeSource {
  readonly territories: readonly (Pick<Territory, 'delivery'> & { readonly id: TerritoryId })[];
  readonly background?: BackgroundWork;
  /** Done quests whose delivery has an outcome (forgeOutcomesOf), or nothing to push. Absent: none. */
  readonly forge?: readonly QuestId[];
  /** Done quests whose branch is in the base branch already (PS-08d, forgeArchives): archived, never pushed. */
  readonly in_base?: readonly QuestId[];
  /** (PS-09) What each done quest touched, read once from its plot: the queue's order. Absent: none known. */
  readonly forge_sizes?: readonly ForgeSize[];
  /** (PS-09) Pull requests open whose branch no longer merges cleanly into the base branch: due again. */
  readonly forge_stale?: readonly QuestId[];
  /** Pull requests open, the last outcome `delivery.pushed` (PS-08d): a sealed one holds its lane (PS-09). */
  readonly forge_waits?: readonly { readonly quest: QuestId }[];
  /** (PS-09d) Territories whose default branch is red: their queue stands, the patrol's fix aside (baseRedOf). */
  readonly base_red?: readonly BaseRed[];
  /** (PS-08b) The delegation of the seal: which done quests without it the Steward merges (mergeDue). Absent: none. */
  readonly seal_policy?: SealPolicy;
}

/** How much a done quest's branch changed, from its plot's touched files (PS-09). */
export interface ForgeSize {
  readonly quest: QuestId;
  /** Touched files that a glob of the territory's shared_paths matches. */
  readonly shared: number;
  readonly touched: number;
}

/** Whether a stale pull request may be updated once more (PS-09); `rounds`: the updates it had in this delivery. */
export const updateRoundsLeft = (rounds: number): boolean => rounds < UPDATE_ROUNDS_MAX;

/**
 * The queue's order: a pull request the base branch overtook first (it was ahead), then fewer hot files, then fewer
 * files; a quest whose size is not known yet goes after.
 */
function queueOrder(sizes: ReadonlyMap<QuestId, ForgeSize>, stale: ReadonlySet<QuestId>) {
  const keyOf = (quest: Quest): readonly [number, number, number] => {
    const size = sizes.get(quest.id);
    const first = stale.has(quest.id) ? 0 : 1;
    return size === undefined ? [first, Number.MAX_SAFE_INTEGER, 0] : [first, size.shared, size.touched];
  };
  return (a: Quest, b: Quest): number => {
    const [[staleA, sharedA, touchedA], [staleB, sharedB, touchedB]] = [keyOf(a), keyOf(b)];
    return staleA - staleB || sharedA - sharedB || touchedA - touchedB;
  };
}

/** Territories whose lane is held: a delivery runs there, or a sealed pull request waits there to be merged. */
function busyOf(source: ForgeSource, done: readonly Quest[], stale: ReadonlySet<QuestId>): Set<TerritoryId> {
  const running = new Set(source.background?.running);
  const waiting = new Set((source.forge_waits ?? []).map(({ quest }) => quest));
  const territories = new Map(source.territories.map((territory) => [territory.id, territory]));
  const holds = (quest: Quest): boolean =>
    running.has(quest.id) ||
    (waiting.has(quest.id) &&
      !stale.has(quest.id) &&
      mergeDue(quest, territories.get(quest.territory), source.seal_policy));
  return new Set(done.filter(holds).map(({ territory }) => territory));
}

/**
 * The deliveries due now, from `done` (by rank, byPriority) in the queue's order: one per territory, none on a
 * territory whose delivery still runs, nor (PS-09d) on one whose default branch is red, the patrol's fix aside. A done
 * quest's work in the background is its delivery: checks and scripts leave with `review` and `working` (wantedIn).
 * Whether each starts now is the room's (startingNow).
 */
export function forgeDeliveries(source: ForgeSource, done: readonly Quest[]): QuestId[] {
  const stale = new Set(source.forge_stale);
  const settled = new Set([
    ...(source.forge ?? []).filter((id) => !stale.has(id)),
    ...(source.in_base ?? []),
  ]);
  const territories = new Map(source.territories.map((territory) => [territory.id, territory]));
  const busy = busyOf(source, done, stale);
  const sizes = new Map((source.forge_sizes ?? []).map((size) => [size.quest, size]));
  const stopped = stoppedByBase(source.base_red);
  const picked: QuestId[] = [];
  for (const quest of done.toSorted(queueOrder(sizes, stale))) {
    if (busy.has(quest.territory) || settled.has(quest.id) || stopped(quest)) continue;
    if (!forgeDue(quest, territories.get(quest.territory))) continue;
    busy.add(quest.territory);
    picked.push(quest.id);
  }
  return picked;
}

/**
 * (CM-03) The territories whose merge queue is at work, by id: a delivery runs or is due there, or a sealed pull
 * request waits there to be merged. The patrol after a merge waits for them (mergedPatrolOf), so a burst of merges is
 * patrolled once, at its last head.
 */
export function queueAtWorkOf(source: ForgeSource, done: readonly Quest[]): TerritoryId[] {
  const due = new Set(forgeDeliveries(source, done));
  const busy = busyOf(source, done, new Set(source.forge_stale));
  for (const quest of done) if (due.has(quest.id)) busy.add(quest.territory);
  return [...busy].toSorted((a, b) => a.localeCompare(b));
}
