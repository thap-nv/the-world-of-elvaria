import { isEventOf } from '../../schema/event/event.ts';
import type { QuestId } from '../../core/ids.ts';
import type { Event } from '../../schema/event/event.ts';

export interface MeasuredCheckRun {
  readonly quest: QuestId;
  readonly at: string;
  readonly mode: 'full' | 'narrow';
  readonly elapsed_ms: number;
}

const keyOf = (event: Event, delivery: boolean | undefined): string =>
  JSON.stringify([event.quest, event.attempt, delivery === true]);

/** Consume each start once; queue checks and submitted-run checks must never pair with one another. */
export function measuredRunsOf(events: readonly Event[]): MeasuredCheckRun[] {
  const starts = new Map<string, string>();
  const runs: MeasuredCheckRun[] = [];
  for (const event of events) {
    if (event.quest === undefined) continue;
    if (isEventOf(event, 'check.start')) starts.set(keyOf(event, event.data.delivery), event.ts);
    if (!isEventOf(event, 'check.end')) continue;
    const key = keyOf(event, event.data.delivery);
    const start = starts.get(key);
    starts.delete(key);
    if (start === undefined || (event.data.outcome !== 'pass' && event.data.outcome !== 'fail')) continue;
    runs.push({
      quest: event.quest,
      at: event.ts,
      mode: event.data.mode ?? 'full',
      elapsed_ms: Math.max(0, Date.parse(event.ts) - Date.parse(start)),
    });
  }
  return runs;
}
