import { isTypedEvent } from '../../schema/event/event.ts';
import { isQuestLogType } from '../../world/quest-log-type.ts';
import { dayOf } from '../window.ts';
import type { Event, EventOf } from '../../schema/event/event.ts';
import type { QuestLogType } from '../../world/quest-log-type.ts';
import type { QuestView } from '../../world/quest-view.ts';
import type { MetricsWindow } from '../window.ts';

export interface QuestPeak {
  readonly territory: string;
  readonly working: number;
  readonly review: number;
}

function viewOf(event: Event): QuestView | undefined {
  if (!isTypedEvent(event) || !isQuestLogType(event.type)) return undefined;
  return (event as EventOf<QuestLogType>).data.quest;
}

function record(views: ReadonlyMap<string, QuestView>, peaks: Map<string, QuestPeak>): void {
  const counts = new Map<string, QuestPeak>();
  for (const view of views.values()) {
    const count = counts.get(view.territory) ?? { territory: view.territory, working: 0, review: 0 };
    counts.set(view.territory, {
      ...count,
      working: count.working + Number(view.status === 'working'),
      review: count.review + Number(view.status === 'review' && view.verifier !== null),
    });
  }
  for (const [territory, count] of counts) {
    const before = peaks.get(territory) ?? count;
    peaks.set(territory, {
      territory,
      working: Math.max(before.working, count.working),
      review: Math.max(before.review, count.review),
    });
  }
}

/** Replay pre-window views too: a quest already working at midnight still occupies a slot. */
export function questPeaksOf(events: readonly Event[], window: MetricsWindow): QuestPeak[] {
  const views = new Map<string, QuestView>();
  const peaks = new Map<string, QuestPeak>();
  for (const event of events) {
    const day = dayOf(event.ts);
    const view = viewOf(event);
    if (window.since !== undefined && day < window.since) {
      if (view !== undefined) views.set(view.id, view);
      continue;
    }
    record(views, peaks);
    if (window.until !== undefined && day > window.until) break;
    if (view === undefined) continue;
    views.set(view.id, view);
    record(views, peaks);
  }
  record(views, peaks);
  return [...peaks.values()].sort((a, b) => a.territory.localeCompare(b.territory));
}
