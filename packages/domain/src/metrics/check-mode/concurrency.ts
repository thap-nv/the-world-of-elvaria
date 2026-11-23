import { isTypedEvent } from '../../schema/event/event.ts';
import { isQuestLogType } from '../../world/quest-log-type.ts';
import { dayOf } from '../window.ts';
import type { QuestId, TerritoryId } from '../../core/ids.ts';
import type { Event, EventOf } from '../../schema/event/event.ts';
import type { QuestLogType } from '../../world/quest-log-type.ts';
import type { QuestView } from '../../world/quest-view.ts';
import type { MetricsWindow } from '../window.ts';

export interface QuestPeak {
  readonly territory: TerritoryId;
  readonly working: number;
  readonly review: number;
}

interface TerritoryCount {
  working: number;
  review: number;
}

function viewOf(event: Event): QuestView | undefined {
  if (!isTypedEvent(event) || !isQuestLogType(event.type)) return undefined;
  return (event as EventOf<QuestLogType>).data.quest;
}

function countOf(counts: Map<TerritoryId, TerritoryCount>, territory: TerritoryId): TerritoryCount {
  const existing = counts.get(territory);
  if (existing !== undefined) return existing;
  const fresh = { working: 0, review: 0 };
  counts.set(territory, fresh);
  return fresh;
}

function touchPeak(
  territory: TerritoryId,
  counts: Map<TerritoryId, TerritoryCount>,
  peaks: Map<TerritoryId, QuestPeak>,
): void {
  const count = countOf(counts, territory);
  const before = peaks.get(territory);
  peaks.set(territory, {
    territory,
    working: Math.max(before?.working ?? 0, count.working),
    review: Math.max(before?.review ?? 0, count.review),
  });
}

function adjust(count: TerritoryCount, view: QuestView, sign: 1 | -1): void {
  count.working += sign * Number(view.status === 'working');
  count.review += sign * Number(view.status === 'review' && view.verifier !== null);
}

function applyView(
  view: QuestView,
  views: Map<QuestId, QuestView>,
  counts: Map<TerritoryId, TerritoryCount>,
): TerritoryId | undefined {
  const prev = views.get(view.id);
  views.set(view.id, view);
  if (prev === undefined) {
    adjust(countOf(counts, view.territory), view, 1);
    return undefined;
  }
  adjust(countOf(counts, prev.territory), prev, -1);
  adjust(countOf(counts, view.territory), view, 1);
  return prev.territory !== view.territory ? prev.territory : undefined;
}

function snapshotCounts(counts: Map<TerritoryId, TerritoryCount>, peaks: Map<TerritoryId, QuestPeak>): void {
  for (const territory of counts.keys()) {
    touchPeak(territory, counts, peaks);
  }
}

/** Replay pre-window views too: a quest already working at midnight still occupies a slot. */
export function questPeaksOf(events: readonly Event[], window: MetricsWindow): QuestPeak[] {
  const views = new Map<QuestId, QuestView>();
  const counts = new Map<TerritoryId, TerritoryCount>();
  const peaks = new Map<TerritoryId, QuestPeak>();
  let entered = false;

  for (const event of events) {
    const day = dayOf(event.ts);
    const view = viewOf(event);
    if (window.since !== undefined && day < window.since) {
      if (view !== undefined) applyView(view, views, counts);
      continue;
    }
    if (!entered) {
      snapshotCounts(counts, peaks);
      entered = true;
    }
    if (window.until !== undefined && day > window.until) break;
    if (view === undefined) continue;
    const movedFrom = applyView(view, views, counts);
    touchPeak(view.territory, counts, peaks);
    if (movedFrom !== undefined) touchPeak(movedFrom, counts, peaks);
  }

  if (!entered) snapshotCounts(counts, peaks);
  return [...peaks.values()].sort((a, b) => a.territory.localeCompare(b.territory));
}
