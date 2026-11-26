import { isEventOf } from '../../schema/event/event.ts';
import { MEDIAN_HALVES } from './constants.ts';
import { dayOf, inWindow } from '../window.ts';
import type { Event, EventOf } from '../../schema/event/event.ts';
import type { MetricsWindow } from '../window.ts';

export interface CarriedThenRed {
  readonly territory: string;
  readonly check: string;
  readonly tree: string;
  readonly at: string;
}

export interface Recheck {
  readonly runs_per_check: readonly {
    readonly check: string;
    readonly median: number;
    readonly max: number;
  }[];
  readonly carried_by_day: readonly { readonly day: string; readonly count: number }[];
  readonly carried_then_red: readonly CarriedThenRed[];
}

/** First merge only, including history outside the reporting window. */
export function firstMergesOf(events: readonly Event[], window: MetricsWindow): EventOf<'delivery.merged'>[] {
  const seen = new Set<string>();
  return events.filter((event): event is EventOf<'delivery.merged'> => {
    if (!isEventOf(event, 'delivery.merged') || seen.has(event.data.quest)) return false;
    seen.add(event.data.quest);
    return inWindow(window, event.ts);
  });
}

function questRuns(events: readonly Event[], merge: EventOf<'delivery.merged'>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!isEventOf(event, 'check.end') || event.quest !== merge.data.quest) continue;
    if (Date.parse(event.ts) > Date.parse(merge.ts)) continue;
    if (event.data.outcome !== 'pass' && event.data.outcome !== 'fail') continue;
    for (const check of event.data.checks) {
      const count = counts.get(check.id) ?? 0;
      counts.set(check.id, count + (check.carried_from === undefined ? 1 : 0));
    }
  }
  return counts;
}

function runsPerCheck(events: readonly Event[], window: MetricsWindow): Recheck['runs_per_check'] {
  const quests = firstMergesOf(events, window).map((merge) => questRuns(events, merge));
  const checks = new Set(quests.flatMap((counts) => [...counts.keys()]));
  return [...checks].sort().map((check) => {
    const counts = quests.map((quest) => quest.get(check) ?? 0).sort((a, b) => a - b);
    const middle = counts.slice(
      Math.ceil(counts.length / MEDIAN_HALVES) - 1,
      Math.floor(counts.length / MEDIAN_HALVES) + 1,
    );
    const median = middle.reduce((sum, count) => sum + count, 0) / middle.length;
    return { check, median, max: Math.max(...counts) };
  });
}

function carriedByDay(events: readonly Event[], window: MetricsWindow): Recheck['carried_by_day'] {
  const days = new Map<string, number>();
  for (const event of events.filter((line) => inWindow(window, line.ts))) {
    if (!isEventOf(event, 'check.end') && !isEventOf(event, 'patrol.ran')) continue;
    const count = event.data.checks.filter((check) => check.carried_from !== undefined).length;
    if (count > 0) days.set(dayOf(event.ts), (days.get(dayOf(event.ts)) ?? 0) + count);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
}

/** Compare adjacent patrols for the same territory/tree; a missing check breaks its carry chain. */
export function carriedThenRedOf(events: readonly Event[], window: MetricsWindow): CarriedThenRed[] {
  const previous = new Map<string, ReadonlySet<string>>();
  const rows: CarriedThenRed[] = [];
  for (const event of events) {
    if (!isEventOf(event, 'patrol.ran') || event.data.tree === undefined) continue;
    const { territory, tree, checks } = event.data;
    const key = JSON.stringify([territory, tree]);
    const carried = previous.get(key);
    for (const check of checks) {
      if (check.carried_from !== undefined || check.pass || check.environment) continue;
      if (carried?.has(check.id) === true && inWindow(window, event.ts))
        rows.push({ territory, tree, check: check.id, at: event.ts });
    }
    previous.set(
      key,
      new Set(checks.filter((check) => check.carried_from !== undefined).map((check) => check.id)),
    );
  }
  return rows;
}

export const recheckOf = (events: readonly Event[], window: MetricsWindow): Recheck => ({
  runs_per_check: runsPerCheck(events, window),
  carried_by_day: carriedByDay(events, window),
  carried_then_red: carriedThenRedOf(events, window),
});
