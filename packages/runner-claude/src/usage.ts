// The account's limits as Claude Code reports them (implementation-plan §3.5, ADR 0009; spike P1-02): the stream's
// `rate_limit_event` (one per session, `utilization` 0-1, `resetsAt` in epoch seconds) and the text of
// `claude -p "/usage"` (0 mana, adds the weekly cap of one model). Both are pure parsers; the mana gauge that
// turns windows into ManaReading is P1-05's.
import { numberOf, objectOf, textOf } from './json.ts';
import type { JsonObject } from './json.ts';

export interface UsageWindow {
  readonly window: 'five_hour' | 'weekly';
  /** 0-100. */
  readonly used_pct: number;
  /** ISO 8601 (UTC). */
  readonly resets_at?: string;
  /** The one model a weekly cap applies to (`Fable`); absent for the whole account. */
  readonly model?: string;
}

const isoOfSeconds = (seconds: number | undefined): string | undefined =>
  seconds === undefined ? undefined : new Date(seconds * 1000).toISOString();

const WINDOWS = [
  ['five_hour', 'five_hour'],
  ['seven_day', 'weekly'],
] as const;

/** `rate_limit_info.unifiedWindows` as windows. */
export function rateLimitWindowsOf(info: JsonObject | undefined): UsageWindow[] {
  const unified = objectOf(info, 'unifiedWindows');
  return WINDOWS.flatMap(([key, window]) => {
    const entry = objectOf(unified, key);
    const utilization = numberOf(entry, 'utilization');
    if (utilization === undefined) return [];
    const resets = isoOfSeconds(numberOf(entry, 'resetsAt'));
    return [
      {
        window,
        used_pct: Math.round(utilization * 10_000) / 100,
        ...(resets === undefined ? {} : { resets_at: resets }),
      },
    ];
  });
}

/** `seven_day_opus`: the weekly cap of one model, named by its last word. */
const MODEL_WEEK = /^seven_day_([a-z]+)$/;

/** The window a `rateLimitType` names: the session, the week, or the week of one model; undefined for another. */
function windowOfType(type: string | undefined): Pick<UsageWindow, 'window' | 'model'> | undefined {
  if (type === 'five_hour') return { window: 'five_hour' };
  if (type === 'seven_day') return { window: 'weekly' };
  const model = MODEL_WEEK.exec(type ?? '')?.[1];
  return model === undefined ? undefined : { window: 'weekly', model };
}

/**
 * The window a rejected `rate_limit_event` says is spent, from its `rateLimitType`, until its `resetsAt` (P1-48,
 * P1-22 (d)): the gauge it belongs to sleeps until then, whatever `/usage` reads after it. Undefined while the status
 * is not `rejected`, or for a type that names no window (`overage`).
 */
export function spentWindowOf(info: JsonObject | undefined): UsageWindow | undefined {
  if (textOf(info, 'status') !== 'rejected') return undefined;
  const named = windowOfType(textOf(info, 'rateLimitType'));
  if (named === undefined) return undefined;
  const resets = isoOfSeconds(numberOf(info, 'resetsAt'));
  return { ...named, used_pct: 100, ...(resets === undefined ? {} : { resets_at: resets }) };
}

/**
 * The limit that stopped the session, when `status` says so. Only `allowed` has been seen (spike P1-02); the
 * Agent SDK's types also name `allowed_warning` and `rejected` (P1-16 brings a real one).
 */
export function rejectionOf(
  info: JsonObject | undefined,
): { detail: string; resets_at?: string } | undefined {
  if (textOf(info, 'status') !== 'rejected') return undefined;
  const type = textOf(info, 'rateLimitType') ?? 'unknown';
  const resets = isoOfSeconds(numberOf(info, 'resetsAt'));
  return { detail: `usage limit reached (${type})`, ...(resets === undefined ? {} : { resets_at: resets }) };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** `Current week (Fable): 54% used · resets Nov 8, 8pm (Asia/Bangkok)`. */
const LINE =
  /^Current (session|week \(([^)]+)\)):\s*(\d+(?:\.\d+)?)%\s*used(?:\s*·\s*resets\s+(.+?)\s*\(([^)]+)\))?\s*$/;
const WHEN = /^(?:([A-Za-z]{3})\w*\s+(\d{1,2}),\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;
const DAY_MS = 86_400_000;

/** Offset of `zone` at `timeMs`, in ms east of UTC. Throws RangeError for a zone Intl does not know. */
function offsetMs(timeMs: number, zone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(timeMs)
    .find(({ type }) => type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '');
  if (match === null) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '-' ? -minutes : minutes) * 60_000;
}

/** The instant of a wall-clock time in `zone`. */
function zonedEpoch(fields: readonly [number, number, number, number, number], zone: string): number {
  const wall = Date.UTC(...fields);
  const first = wall - offsetMs(wall, zone);
  return wall - offsetMs(first, zone);
}

/** `Nov 8, 8pm` (or `9:50pm`, today) in `zone`, as the next such instant after `now` minus a day. */
function resetOf(when: string, zone: string, now: number): string | undefined {
  const match = WHEN.exec(when);
  if (match === null) return undefined;
  const [, month, day, hour, minute, half] = match;
  try {
    const today = new Date(now + offsetMs(now, zone));
    const monthIndex = month === undefined ? today.getUTCMonth() : MONTHS.indexOf(month.toLowerCase());
    if (monthIndex === -1) return undefined;
    const hours = (Number(hour) % 12) + (half?.toLowerCase() === 'pm' ? 12 : 0);
    const date = day === undefined ? today.getUTCDate() : Number(day);
    let year = today.getUTCFullYear();
    const at = (y: number) => zonedEpoch([y, monthIndex, date, hours, Number(minute ?? 0)], zone);
    // The text has no year: a reset is never long past, so one more than a day ago belongs to next year.
    if (at(year) < now - DAY_MS) year += 1;
    return new Date(at(year)).toISOString();
  } catch {
    return undefined;
  }
}

/** The windows in the text of `/usage`; lines it does not know are skipped. */
export function usageWindowsOf(text: string, now: number): UsageWindow[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = LINE.exec(line.trim());
    if (match === null) return [];
    const [, which, scope, used, when, zone] = match;
    const model = scope === undefined || scope === 'all models' ? undefined : scope;
    const resets = when === undefined || zone === undefined ? undefined : resetOf(when, zone, now);
    return [
      {
        window: which === 'session' ? 'five_hour' : 'weekly',
        used_pct: Number(used),
        ...(resets === undefined ? {} : { resets_at: resets }),
        ...(model === undefined ? {} : { model }),
      } satisfies UsageWindow,
    ];
  });
}
