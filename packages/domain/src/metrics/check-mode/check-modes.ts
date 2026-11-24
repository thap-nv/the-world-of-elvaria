import { MS_PER_MINUTE } from '../../constants.ts';
import { isEventOf } from '../../schema/event/event.ts';
import { dayOf, inWindow } from '../window.ts';
import { baseRedTimesOf } from './base-red.ts';
import { questPeaksOf } from './concurrency.ts';
import { distributionOf } from './distribution.ts';
import { measuredRunsOf } from './runs.ts';
import { checkEscapesOf } from './escapes.ts';
import type { TerritoryEscapes } from './escapes.ts';
import type { Quest } from '../../schema/quest/quest.ts';
import type { Verdict } from '../../schema/quest/verdict.ts';
import type { QuestId } from '../../core/ids.ts';
import type { Event } from '../../schema/event/event.ts';
import type { MetricsWindow } from '../window.ts';
import type { BaseRedTime } from './base-red.ts';
import type { QuestPeak } from './concurrency.ts';
import type { CheckDistribution } from './distribution.ts';

export interface CheckModes {
  readonly has_attributions: boolean;
  readonly escapes: readonly TerritoryEscapes[];
  readonly durations: readonly (CheckDistribution & { readonly mode: 'full' | 'narrow' | 'patrol' })[];
  readonly full_by_day: readonly { readonly day: string; readonly count: number }[];
  readonly merged_cost: {
    readonly quests: readonly { readonly quest: QuestId; readonly minutes: number }[];
    readonly median_minutes: number | null;
    readonly total_minutes: number;
  };
  readonly base_red: readonly BaseRedTime[];
  readonly submit_to_merge: CheckDistribution;
  readonly peaks: readonly QuestPeak[];
}

function fullByDay(events: readonly Event[], window: MetricsWindow): CheckModes['full_by_day'] {
  const days = new Map<string, number>();
  for (const event of events) {
    if (!inWindow(window, event.ts)) continue;
    if (!isEventOf(event, 'patrol.ran') && !(isEventOf(event, 'check.end') && event.data.mode === undefined))
      continue;
    const day = dayOf(event.ts);
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
}

function machineCost(events: readonly Event[], quest: QuestId, before: string): number {
  return events.reduce((sum, event) => {
    if (!isEventOf(event, 'check.end') || event.quest !== quest || Date.parse(event.ts) > Date.parse(before))
      return sum;
    if (event.data.outcome !== 'pass' && event.data.outcome !== 'fail') return sum;
    return sum + event.data.checks.reduce((ms, check) => ms + check.duration_ms, 0);
  }, 0);
}

function mergedMetrics(events: readonly Event[], window: MetricsWindow) {
  const submitted = new Map<QuestId, string>();
  const costs = new Map<QuestId, number>();
  const waits: number[] = [];
  for (const event of events) {
    if (isEventOf(event, 'quest.submitted') && event.quest !== undefined && !submitted.has(event.quest))
      submitted.set(event.quest, event.ts);
    if (!isEventOf(event, 'delivery.merged') || !inWindow(window, event.ts) || costs.has(event.data.quest))
      continue;
    const { quest } = event.data;
    costs.set(quest, machineCost(events, quest, event.ts));
    const start = submitted.get(quest);
    if (start !== undefined) waits.push(Math.max(0, Date.parse(event.ts) - Date.parse(start)));
  }
  return {
    merged_cost: {
      quests: [...costs].map(([quest, ms]) => ({ quest, minutes: ms / MS_PER_MINUTE })),
      median_minutes: distributionOf([...costs.values()]).median_minutes,
      total_minutes: [...costs.values()].reduce((sum, ms) => sum + ms, 0) / MS_PER_MINUTE,
    },
    submit_to_merge: distributionOf(waits),
  };
}

/** End-day run distributions; merged quests include their historical check cost up to their first merge. */
export function checkModesOf(
  events: readonly Event[],
  window: MetricsWindow,
  quests: readonly Quest[] = [],
  verdicts: readonly Verdict[] = [],
): CheckModes {
  const runs = measuredRunsOf(events);
  const completed = runs.filter((run) => inWindow(window, run.at));
  const patrols = events.filter((event) => isEventOf(event, 'patrol.ran') && inWindow(window, event.ts));
  const patrolMs = patrols.flatMap((event) => {
    if (!isEventOf(event, 'patrol.ran') || event.data.checks.length === 0) return [];
    return [event.data.checks.reduce((sum, check) => sum + check.duration_ms, 0)];
  });
  return {
    has_attributions: events.some(
      (event) => isEventOf(event, 'check.attributed') && inWindow(window, event.ts),
    ),
    escapes: checkEscapesOf(events, window, quests, verdicts),
    durations: [
      ...(['full', 'narrow'] as const).map((mode) => ({
        mode,
        ...distributionOf(completed.filter((run) => run.mode === mode).map((run) => run.elapsed_ms)),
      })),
      { mode: 'patrol', ...distributionOf(patrolMs), count: patrols.length },
    ],
    full_by_day: fullByDay(events, window),
    ...mergedMetrics(events, window),
    base_red: baseRedTimesOf(events, window),
    peaks: questPeaksOf(events, window),
  };
}
