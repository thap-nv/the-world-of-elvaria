import { MS_PER_MINUTE } from '../../constants.ts';
import { isEventOf } from '../../schema/event/event.ts';
import { dayOf, inWindow } from '../window.ts';
import { CheckIdSchema } from '../../core/ids.ts';
import type { CheckId, TerritoryId } from '../../core/ids.ts';
import type { Event } from '../../schema/event/event.ts';
import type { MetricsWindow } from '../window.ts';

const SETUP = CheckIdSchema.parse('setup');

export interface BaseRedTime {
  readonly territory: TerritoryId;
  readonly check: CheckId;
  readonly since: string;
  readonly until: string | null;
  readonly minutes: number | null;
}

function observe(
  open: Map<string, BaseRedTime>,
  closed: BaseRedTime[],
  row: { territory: TerritoryId; check: CheckId; pass: boolean; ts: string },
): void {
  const key = JSON.stringify([row.territory, row.check]);
  const before = open.get(key);
  if (row.pass) {
    if (before !== undefined)
      closed.push({
        ...before,
        until: row.ts,
        minutes: (Date.parse(row.ts) - Date.parse(before.since)) / MS_PER_MINUTE,
      });
    open.delete(key);
  } else if (before === undefined) {
    open.set(key, { territory: row.territory, check: row.check, since: row.ts, until: null, minutes: null });
  }
}

/** Keep an open interval until that same check explicitly passes; missing/environment results say nothing. */
export function baseRedTimesOf(events: readonly Event[], window: MetricsWindow): BaseRedTime[] {
  const open = new Map<string, BaseRedTime>();
  const closed: BaseRedTime[] = [];
  for (const event of events) {
    if (window.until !== undefined && dayOf(event.ts) > window.until) continue;
    if (!isEventOf(event, 'patrol.ran') || event.data.plot_failure !== undefined) continue;
    const { territory, checks, setup } = event.data;
    const results = checks.filter((check) => !check.environment);
    const all = setup === null ? results : [...results, { id: SETUP, pass: setup.pass }];
    for (const result of all) {
      observe(open, closed, { territory, check: result.id, pass: result.pass, ts: event.ts });
    }
  }
  // Report intervals touching the window with their actual endpoints, rather than inventing a midnight recovery.
  return [...closed, ...open.values()].filter(
    (row) => row.until === null || inWindow(window, row.until) || inWindow(window, row.since),
  );
}
