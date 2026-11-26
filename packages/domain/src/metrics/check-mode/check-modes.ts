import { MS_PER_MINUTE } from '../../constants.ts';
import { isEventOf } from '../../schema/event/event.ts';
import { dayOf, inWindow } from '../window.ts';
import { baseRedTimesOf } from './base-red.ts';
import { questPeaksOf } from './concurrency.ts';
import { distributionOf } from './distribution.ts';
import { everyCarried, measuredRunsOf } from './runs.ts';
import { checkEscapesOf } from './escapes.ts';
import { firstMergesOf, recheckOf } from './recheck.ts';
import type { Recheck } from './recheck.ts';
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
  readonly recheck: Recheck;
  readonly has_attributions: boolean;
  readonly escapes: readonly TerritoryEscapes[];
  readonly durations: readonly (CheckDistribution & { readonly mode: 'full' | 'narrow' | 'patrol' })[];
  readonly full_by_day: readonly { readonly day: string; readonly count: number }[];
  readonly merged_cost: {
    readonly quests: readonly {
      readonly quest: QuestId;
      readonly minutes: number;
      readonly push_minutes: number;
    }[];
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
    if (everyCarried(event.data.checks)) continue;
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

function pushCost(events: readonly Event[], quest: QuestId, before: string): number {
  return events.reduce((sum, event) => {
    if (!isEventOf(event, 'delivery.pushed') || event.data.quest !== quest) return sum;
    return Date.parse(event.ts) <= Date.parse(before) ? sum + (event.data.push_ms ?? 0) : sum;
  }, 0);
}

function mergedMetrics(events: readonly Event[], window: MetricsWindow) {
  const submitted = new Map<QuestId, string>();
  const costs = new Map<QuestId, number>();
  const quests: { quest: QuestId; minutes: number; push_minutes: number }[] = [];
  const waits: number[] = [];
  const merges = new Set(firstMergesOf(events, window));
  for (const event of events) {
    if (isEventOf(event, 'quest.submitted') && event.quest !== undefined && !submitted.has(event.quest))
      submitted.set(event.quest, event.ts);
    if (!isEventOf(event, 'delivery.merged') || !merges.has(event)) continue;
    const { quest } = event.data;
    const push = pushCost(events, quest, event.ts);
    const cost = machineCost(events, quest, event.ts) + push;
    costs.set(quest, cost);
    quests.push({ quest, minutes: cost / MS_PER_MINUTE, push_minutes: push / MS_PER_MINUTE });
    const start = submitted.get(quest);
    if (start !== undefined) waits.push(Math.max(0, Date.parse(event.ts) - Date.parse(start)));
  }
  return {
    merged_cost: {
      quests,
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
  const patrols = events.filter(
    (event) =>
      isEventOf(event, 'patrol.ran') && inWindow(window, event.ts) && !everyCarried(event.data.checks),
  );
  const patrolMs = patrols.flatMap((event) => {
    if (!isEventOf(event, 'patrol.ran') || event.data.checks.length === 0) return [];
    return [event.data.checks.reduce((sum, check) => sum + check.duration_ms, 0)];
  });
  return {
    recheck: recheckOf(events, window),
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
