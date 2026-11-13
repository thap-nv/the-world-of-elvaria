// How long quests stay in each status (owner 2026-11-13, research session, §11; PS-06b), from the log alone: every
// quest line carries the quest's view after its move, so a quest stays in a status from the line that put it there to
// the first line that moved it on. `review` is two: waiting for a judge (its checks included) and held by one; with
// `awaiting_seal` they are where the world waits on someone, which a single run's numbers never show.
import { MS_PER_MINUTE } from '../constants.ts';
import { isEventOf, isTypedEvent } from '../schema/event/event.ts';
import { QUEST_STATUSES } from '../schema/quest/shared.ts';
import { middleOf } from './session-counts.ts';
import { inWindow } from './window.ts';
import type { MetricsWindow } from './window.ts';
import type { Event, EventOf } from '../schema/event/event.ts';
import type { QuestStatus } from '../schema/quest/shared.ts';
import type { QuestLogType } from '../world/quest-log-type.ts';
import type { QuestView } from '../world/quest-view.ts';

export interface StatusTime {
  readonly status: QuestStatus;
  /** `review` only: whether a judge held the quest (true) or it waited for one, its checks running (false); else null. */
  readonly judge: boolean | null;
  /** The stays that ended inside the window; a quest still in the status is not counted, the log has no end for it. */
  readonly stays: number;
  readonly median_minutes: number;
  readonly max_minutes: number;
}

interface Place {
  readonly status: QuestStatus;
  readonly judge: boolean | null;
}

interface Stay extends Place {
  readonly ms: number;
}

/** The quest's view on a quest line; `quest.unclaimable` is a notice with no view (P1-03). */
function viewOf(event: Event): QuestView | undefined {
  if (!isTypedEvent(event) || !event.type.startsWith('quest.') || isEventOf(event, 'quest.unclaimable'))
    return undefined;
  return (event as EventOf<QuestLogType>).data.quest;
}

const placeOf = (view: QuestView): Place => ({
  status: view.status,
  judge: view.status === 'review' ? view.verifier !== null : null,
});

const keyOf = ({ status, judge }: Place): string => `${status}|${String(judge)}`;

/** Every stay that ended inside the window: from the line that put a quest in a place to the one that moved it on. */
function staysOf(events: readonly Event[], window: MetricsWindow): Stay[] {
  const open = new Map<string, Place & { readonly since: string }>();
  const stays: Stay[] = [];
  for (const event of events) {
    const view = viewOf(event);
    if (view === undefined) continue;
    const place = placeOf(view);
    const before = open.get(view.id);
    if (before !== undefined && keyOf(before) === keyOf(place)) continue;
    if (before !== undefined && inWindow(window, event.ts)) {
      const ms = Math.max(0, Date.parse(event.ts) - Date.parse(before.since));
      stays.push({ status: before.status, judge: before.judge, ms });
    }
    open.set(view.id, { ...place, since: event.ts });
  }
  return stays;
}

/** Review waiting for a judge, and review held by one. */
const PLACES_PER_STATUS = 2;

/** A place's rank in the table: the statuses' order, review waiting before review held. */
const rankOf = ({ status, judge }: Place): number =>
  QUEST_STATUSES.indexOf(status) * PLACES_PER_STATUS + Number(judge === true);

/** Each place quests left inside the window, with how long they stayed: the median and the longest. */
export function statusTimesOf(events: readonly Event[], window: MetricsWindow): StatusTime[] {
  const byPlace = new Map<string, Stay[]>();
  for (const stay of staysOf(events, window))
    byPlace.set(keyOf(stay), [...(byPlace.get(keyOf(stay)) ?? []), stay]);
  return [...byPlace.values()]
    .map((stays): StatusTime => {
      const [{ status, judge }] = stays as [Stay, ...Stay[]];
      const ms = stays.map((stay) => stay.ms);
      return {
        status,
        judge,
        stays: stays.length,
        median_minutes: middleOf(ms) / MS_PER_MINUTE,
        max_minutes: Math.max(...ms) / MS_PER_MINUTE,
      };
    })
    .sort((a, b) => rankOf(a) - rankOf(b));
}
