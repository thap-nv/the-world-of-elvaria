// The patrol's book (PS-26): the health of each patrolled territory's default branch, rebuilt from the log at start
// (baseHealthOf) and set by each patrol of a territory. The tick's notices carry it to the digest's `base_red` items;
// (PS-09d) the snapshot reads the same book to stop a red territory taking quests (baseRedOf), and the book keeps the
// patrols of single territories (runs.ts) and the tips of the red branches already patrolled for (patrolsDue). (CM-03)
// It keeps the newest head of each default branch the Steward saw, for the patrol after a merge (mergedPatrolOf): the
// commit of its own merge there (forge/outcome.ts) or a look's tip (forge/look.ts); at start, the merges since the
// latest patrol of each branch.
import { baseHealthOf, mergesSincePatrolOf } from '@elvaria/domain';
import type { Event, TerritoryHealth, TerritoryId } from '@elvaria/domain';

import { createPatrolRuns } from './runs.ts';
import type { Logger } from '../types.ts';
import type { PatrolRuns } from './runs.ts';

export interface PatrolBook {
  health: readonly TerritoryHealth[];
  /** (PS-09d) The tip each red territory's `base_moved` patrol started for; in memory, a new Steward looks again. */
  readonly tried: Map<TerritoryId, string>;
  /** (CM-03) The newest head of each default branch the Steward saw: its own merge's commit, or a look's tip. */
  readonly heads: Map<TerritoryId, string>;
  /** (613) Delivery merges since the latest patrol that tried their head. */
  readonly merges: Map<TerritoryId, number>;
  /** (PS-09d) Every patrol of a territory runs in its lane; those outside the scheduled job start here. */
  readonly runs: PatrolRuns;
}

const QUIET: Logger = { warn: () => undefined };

export const createPatrolBook = (log: Logger = QUIET, ended?: () => void): PatrolBook => ({
  health: [],
  tried: new Map(),
  heads: new Map(),
  merges: new Map(),
  runs: createPatrolRuns(log, ended),
});

export function recoverPatrol(book: PatrolBook, events: readonly Event[]): void {
  book.health = baseHealthOf(events);
  book.heads.clear();
  book.merges.clear();
  for (const { territory, head, merges } of mergesSincePatrolOf(events)) {
    book.heads.set(territory, head);
    book.merges.set(territory, merges);
  }
}

/** Count a delivery merge. */
export function recordPatrolMerge(book: PatrolBook, territory: TerritoryId, head: string): void {
  book.heads.set(territory, head);
  book.merges.set(territory, (book.merges.get(territory) ?? 0) + 1);
}

/** The book's health with `health` in place of its territory's: a patrol of one territory leaves the others as they are. */
export function setHealth(
  book: PatrolBook,
  territory: TerritoryId,
  health: TerritoryHealth | undefined,
): void {
  const others = book.health.filter((watch) => watch.territory !== territory);
  book.health = (health === undefined ? others : [...others, health]).toSorted((a, b) =>
    a.territory.localeCompare(b.territory),
  );
}
