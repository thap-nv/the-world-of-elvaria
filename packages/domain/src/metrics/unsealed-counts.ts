// How much of each territory's work went to the base branch without the royal seal (PS-08b, ADR 0023): the
// `delivery.merged` lines in the window, how many of them say `sealed: false`, and (PS-08g) how many of those a signal
// of the breaker named: the owner's report of an escaped defect (`quest.escaped`), or a check of the default branch
// that turned red with the merge among its suspects (redFlipsOf). The owner weighs the delegation of the seal by it.
// The owner's reports are listed too, sealed or not: escaped defects no return could show, the quest being merged.
import { isEventOf } from '../schema/event/event.ts';
import { redFlipsOf } from '../patrol/health.ts';
import { inWindow } from './window.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { MetricsWindow } from './window.ts';

/** A territory's merges by the Steward in the window, those without the seal, and those of them a signal named. */
export interface UnsealedCount {
  readonly territory: TerritoryId;
  readonly merged: number;
  readonly unsealed: number;
  readonly escaped: number;
}

/** The quests merged without the seal that a signal of the breaker named, in the whole log. */
function namedOf(events: readonly Event[]): Set<QuestId> {
  const reported = events.flatMap((event) =>
    isEventOf(event, 'quest.escaped') && event.data.delegated ? [event.data.quest] : [],
  );
  const suspects = redFlipsOf(events).flatMap(({ suspects: all }) =>
    all.filter(({ sealed }) => !sealed).map(({ quest }) => quest),
  );
  return new Set([...reported, ...suspects]);
}

/** One row per territory with a merge by the Steward in the window, by id; none without one. */
export function unsealedCountsOf(events: readonly Event[], window: MetricsWindow): UnsealedCount[] {
  const named = namedOf(events);
  const counts = new Map<TerritoryId, Omit<UnsealedCount, 'territory'>>();
  for (const event of events) {
    if (!isEventOf(event, 'delivery.merged') || !inWindow(window, event.ts)) continue;
    const { territory, quest, sealed } = event.data;
    const count = counts.get(territory) ?? { merged: 0, unsealed: 0, escaped: 0 };
    counts.set(territory, {
      merged: count.merged + 1,
      unsealed: count.unsealed + (sealed ? 0 : 1),
      escaped: count.escaped + (!sealed && named.has(quest) ? 1 : 0),
    });
  }
  return [...counts]
    .map(([territory, count]) => ({ territory, ...count }))
    .sort((a, b) => a.territory.localeCompare(b.territory));
}

/** A defect the owner reported after the quest reached its base branch (`elvaria quest escaped`, PS-08g). */
export interface ReportedEscape {
  readonly quest: QuestId;
  readonly territory: TerritoryId;
  readonly at: string;
  /** The delegation merged the quest without the seal. */
  readonly delegated: boolean;
  readonly note?: string | undefined;
}

/** The owner's reports in the window, in the log's order. */
export const reportedEscapesOf = (events: readonly Event[], window: MetricsWindow): ReportedEscape[] =>
  events.flatMap((event) =>
    isEventOf(event, 'quest.escaped') && inWindow(window, event.ts) ? [{ ...event.data, at: event.ts }] : [],
  );
