// The patrol after the default branch moved (CM-03, ADR 0032, plans/check-modes.md; the owner's C8 turns K16 of the
// phase-2 plan around): a territory checked narrowly (`narrow`, `deferred`) runs its full set of checks on the base
// branch only, so its patrol follows batches of the Steward's delivery merges, and not the schedule alone.
// A `full` territory's merge queue ran every check on the very tree it merged: no
// patrol more. The patrol waits for its territory's merge queue to be quiet and tries the head the branch has then, so
// a burst of merges is patrolled once, at its last head; the queue never waits for it. HEAVY_WORK_MAX at a time in the
// kingdom, and only in a slot of dispatch.max_background left free by the tick's work, which it then holds
// (startingNow). A red territory's moves are base_moved's (patrolsDue).
// (613) Wait for after_merge.every merges (default 3); the daily P1D schedule covers the tail. The Steward skips
// a non-empty range matching only the territory's quiet_paths, when its latest patrol head and changed paths are known.
// A look's head (PS-08d, a manual merge) is not counted: it waits for P1D or every delivery merges of the Steward's.
// A merge arriving during a patrol stays counted unless that patrol tried the newest merge head.
import { AFTER_MERGE_EVERY, HEAVY_WORK_MAX } from './constants.ts';
import { isEventOf } from '../schema/event/event.ts';
import { checkPolicyOf } from '../schema/territory-check-policy.ts';
import type { BaseRed, BaseTip } from './base-red.ts';
import type { TerritoryHealth } from './health.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { Territory } from '../schema/territory.ts';
import type { TerritoryPatrol } from '../schema/territory-patrol.ts';

/** Absent configuration keeps old territory files valid (ADR 0003). */
export const afterMergeOf = (patrol: TerritoryPatrol | undefined) =>
  patrol?.after_merge ?? { every: AFTER_MERGE_EVERY, quiet_paths: [] };

export interface MergeTip extends BaseTip {
  readonly merges: number;
}

type Watched = Pick<Territory, 'id' | 'vcs' | 'patrol' | 'check_policy'>;

/** What mergedPatrolOf decides on. */
export interface MovedSource {
  readonly territories: readonly Watched[];
  /** The latest patrol of each territory (baseHealthOf): the head it tried. */
  readonly health: readonly TerritoryHealth[];
  /** The newest head of each default branch the Steward saw: the commit its own merge left there, or a look's tip. */
  readonly tips: readonly MergeTip[];
  /** The tip each patrol outside the scheduled job started for, patrolsDue's too: a failed plot is not tried again. */
  readonly tried: ReadonlyMap<TerritoryId, string>;
  /** The red territories (baseRedOf): base_moved patrols them. Absent: none. */
  readonly base_red?: readonly BaseRed[];
  /** Territories whose merge queue is at work (queueAtWorkOf): a merge may follow, so the patrol waits for it. */
  readonly queued: readonly TerritoryId[];
  /** Patrols of any territory running or waiting now. */
  readonly patrolling: number;
  /** Slots of dispatch.max_background free once the tick's work started. */
  readonly room: number;
}

/** Whether the patrol follows the moves of `territory`'s default branch: git, patrolled, checked narrowly. */
export const patrolsAfterMerge = (territory: Watched): boolean =>
  territory.vcs.type === 'git' && territory.patrol !== undefined && checkPolicyOf(territory).mode !== 'full';

/**
 * The territory to patrol now (`merged`) and the tip it is patrolled for, the first by id; none while heavy work runs
 * or no slot is free. Its tip is neither the commit its latest patrol tried nor one a patrol already started for, and
 * it is neither red nor its queue at work.
 */
export function mergedPatrolOf(source: MovedSource): BaseTip | undefined {
  if (source.patrolling >= HEAVY_WORK_MAX || source.room <= 0) return undefined;
  const followed = new Map(
    source.territories.filter(patrolsAfterMerge).map(({ id, patrol }) => [id, afterMergeOf(patrol).every]),
  );
  const red = (source.base_red ?? []).map(({ territory }) => territory);
  const waits = new Set([...red, ...source.queued]);
  const heads = new Map(source.health.map(({ territory, head }) => [territory, head]));
  const moved = ({ territory, head }: BaseTip): boolean =>
    heads.get(territory) !== head && source.tried.get(territory) !== head;
  return source.tips
    .filter(
      (tip) =>
        tip.merges >= (followed.get(tip.territory) ?? Infinity) && !waits.has(tip.territory) && moved(tip),
    )
    .toSorted((a, b) => a.territory.localeCompare(b.territory))
    .map(({ territory, head }) => ({ territory, head }))
    .at(0);
}

/**
 * The commit the Steward's latest merge left on each default branch since the latest patrol that tried a commit there
 * (`delivery.merged`, (CM-07) a guest's `delivery.guest_merged`, `patrol.ran`), by territory: what it knew of the
 * moves before it stopped, given back at start.
 */
export function mergesSincePatrolOf(events: readonly Event[]): MergeTip[] {
  const heads = new Map<TerritoryId, { head: string; merges: number }>();
  for (const event of events) {
    if (isEventOf(event, 'delivery.merged') || isEventOf(event, 'delivery.guest_merged'))
      heads.set(event.data.territory, {
        head: event.data.merge_sha,
        merges: (heads.get(event.data.territory)?.merges ?? 0) + 1,
      });
    else if (
      isEventOf(event, 'patrol.ran') &&
      event.data.head !== null &&
      heads.get(event.data.territory)?.head === event.data.head
    )
      heads.delete(event.data.territory);
  }
  return [...heads]
    .map(([territory, tip]) => ({ territory, ...tip }))
    .toSorted((a, b) => a.territory.localeCompare(b.territory));
}
