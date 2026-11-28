// A wait of ready work (LL-03): what waits, why, and what holds it. Its own file, so the reading of each reason
// (tick-waits.ts, room-waits.ts) and the book of edges (wait-book.ts) share it without importing one another.
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { WaitHolder, WaitReason } from '../schema/event/wait-data.ts';

export interface Wait {
  readonly reason: WaitReason;
  readonly territory: TerritoryId;
  /** The quest that waits; absent for a guest entry. */
  readonly quest?: QuestId;
  /** The guest entry of the merge queue (CM-07) that waits. */
  readonly pr?: number;
  readonly holder: WaitHolder;
}
