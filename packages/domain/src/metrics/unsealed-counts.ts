// How much of each territory's work went to the base branch without the royal seal (PS-08b, ADR 0023): the
// `delivery.merged` lines in the window, and how many of them say `sealed: false`. The owner weighs the delegation of
// the seal by it; PS-08g adds the defects that escaped among them.
import { isEventOf } from '../schema/event/event.ts';
import { inWindow } from './window.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { MetricsWindow } from './window.ts';

/** A territory's merges by the Steward in the window, and those without the seal. */
export interface UnsealedCount {
  readonly territory: TerritoryId;
  readonly merged: number;
  readonly unsealed: number;
}

/** One row per territory with a merge by the Steward in the window, by id; none without one. */
export function unsealedCountsOf(events: readonly Event[], window: MetricsWindow): UnsealedCount[] {
  const counts = new Map<TerritoryId, { merged: number; unsealed: number }>();
  for (const event of events) {
    if (!isEventOf(event, 'delivery.merged') || !inWindow(window, event.ts)) continue;
    const count = counts.get(event.data.territory) ?? { merged: 0, unsealed: 0 };
    counts.set(event.data.territory, {
      merged: count.merged + 1,
      unsealed: count.unsealed + (event.data.sealed ? 0 : 1),
    });
  }
  return [...counts]
    .map(([territory, count]) => ({ territory, ...count }))
    .sort((a, b) => a.territory.localeCompare(b.territory));
}
