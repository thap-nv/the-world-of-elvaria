// The account's windows from `account/rateLimits/read` of `codex app-server` (spike Codex 2026-11-12 §1.11), 0 mana:
// `primary` is the 5-hour window, `secondary` the weekly one, each with `usedPercent` and `resetsAt` (epoch seconds).
// A limit with `normalModelSlug` caps one model only. The answer also names the account: none of it is kept.
import type { ProbeResult } from '@elvaria/runner-core';

type ReportedWindow = NonNullable<ProbeResult['windows']>[number];
type Json = Record<string, unknown>;

/** The windows Codex reports and the gauges they feed (ManaWindow of the domain). */
const FIVE_HOURS_MINUTES = 300;
const WEEK_MINUTES = 10_080;
const MS_PER_SECOND = 1000;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const numberAt = (value: Json, key: string): number | undefined =>
  typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] : undefined;

function windowOf(raw: unknown, model: string | undefined): ReportedWindow | undefined {
  if (!isRecord(raw)) return undefined;
  const minutes = numberAt(raw, 'windowDurationMins');
  const used = numberAt(raw, 'usedPercent');
  const window =
    minutes === FIVE_HOURS_MINUTES ? 'five_hour' : minutes === WEEK_MINUTES ? 'weekly' : undefined;
  if (window === undefined || used === undefined) return undefined;
  const resets = numberAt(raw, 'resetsAt');
  return {
    window,
    used_pct: used,
    ...(resets === undefined ? {} : { resets_at: new Date(resets * MS_PER_SECOND).toISOString() }),
    ...(model === undefined ? {} : { model }),
  };
}

/** Every limit of the answer: `rateLimitsByLimitId`, else the one `rateLimits`. */
function limitsOf(answer: unknown): Json[] {
  if (!isRecord(answer)) return [];
  const byId = answer.rateLimitsByLimitId;
  if (isRecord(byId)) return Object.values(byId).filter(isRecord);
  return isRecord(answer.rateLimits) ? [answer.rateLimits] : [];
}

/** The account's windows for the mana gauge (P1-05); a limit of one model names it, so it binds only that model. */
export function windowsOf(answer: unknown): ReportedWindow[] {
  return limitsOf(answer).flatMap((limit) => {
    const model = typeof limit.normalModelSlug === 'string' ? limit.normalModelSlug : undefined;
    return [windowOf(limit.primary, model), windowOf(limit.secondary, model)].filter(
      (window): window is ReportedWindow => window !== undefined,
    );
  });
}

/**
 * The probe's answer: rate limited while a window of the whole account is spent, or the account says ordinary
 * usage is not allowed; the latest reset of the spent windows is when to look again.
 */
export function probeOf(answer: unknown): ProbeResult {
  if (!isRecord(answer)) return { status: 'error', detail: 'account/rateLimits/read: no answer' };
  const windows = windowsOf(answer);
  const spent = windows.filter((window) => window.model === undefined && window.used_pct >= 100);
  const type = isRecord(answer.rateLimits) ? answer.rateLimits.rateLimitReachedType : undefined;
  const reached = typeof type === 'string' && type !== '' ? type : undefined;
  const blocked = answer.ordinaryUsageAllowed === false || reached !== undefined;
  const base = windows.length === 0 ? {} : { windows };
  if (spent.length === 0 && !blocked) return { status: 'ok', ...base };
  const latest = spent
    .map((window) => window.resets_at)
    .filter((at): at is string => at !== undefined)
    .sort()
    .at(-1);
  const which = spent.map((window) => window.window).join(', ');
  return {
    status: 'rate_limited',
    detail:
      spent.length === 0
        ? `the account allows no usage now (${reached ?? 'no reason given'})`
        : `no mana left in the ${which} window`,
    ...(latest === undefined ? {} : { resets_at: latest }),
    ...base,
  };
}
