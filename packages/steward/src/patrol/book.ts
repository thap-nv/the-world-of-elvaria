// The patrol's book (PS-26): the health of each patrolled territory's default branch, rebuilt from the log at start
// (baseHealthOf) and set by the patrol after each run. The tick's notices carry it to the digest's `base_red` items;
// PS-09d's snapshot reads the same book to stop a red territory taking quests.
import { baseHealthOf } from '@elvaria/domain';
import type { Event, TerritoryHealth } from '@elvaria/domain';

export interface PatrolBook {
  health: readonly TerritoryHealth[];
}

export const createPatrolBook = (): PatrolBook => ({ health: [] });

export function recoverPatrol(book: PatrolBook, events: readonly Event[]): void {
  book.health = baseHealthOf(events);
}
