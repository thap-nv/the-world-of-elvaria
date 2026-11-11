// Which days the metrics read (`elvaria metrics --since --until`). A timestamp's day is the one it is written in:
// the Steward writes every time in the kingdom's zone (zonedTime, §2.1), which is also how event files are named, so
// "the day of 2026-11-08" means the same lines in a quest file and in events/2026-11-08.jsonl.
const DAY_PATTERN = 'yyyy-mm-dd';

/** Both ends inclusive, as `yyyy-mm-dd`; an end left out is open. */
export interface MetricsWindow {
  readonly since?: string;
  readonly until?: string;
}

/** The calendar day an ISO 8601 timestamp is written in. */
export const dayOf = (timestamp: string): string => timestamp.slice(0, DAY_PATTERN.length);

export function inWindow(window: MetricsWindow, timestamp: string): boolean {
  const day = dayOf(timestamp);
  return (
    (window.since === undefined || day >= window.since) && (window.until === undefined || day <= window.until)
  );
}
