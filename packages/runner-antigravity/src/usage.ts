// `agy -p /usage --output-format json` (0 tokens, ~3 s; spike P1-12a §7, implementation-plan §3.5): the
// mana buckets of the account. The format is not promised stable, so the parser says when it cannot read it.
import type { ProbeResult } from '@elvaria/runner-core';

export interface UsageBucket {
  readonly id: string;
  /** `gemini-*` → gemini_models, `3p-*` → claude_gpt_models (§3.5). */
  readonly pool: string | undefined;
  readonly window: 'five_hour' | 'weekly' | undefined;
  readonly used_pct: number;
  /** Only once the bucket is in use: an unused one shows a sliding `now + window` (spike §7). */
  readonly resets_at: string | null;
  /** The pool's own 5-hour or weekly limit; `gemini-argon-wtu-weekly` caps one model only. */
  readonly pool_wide: boolean;
  /**
   * The models of the bucket's group as the account names them (`Gemini Flash`, `Gemini Pro`), from the group's
   * description; absent when it lists none (the Argon group says only that its quota is separate). P1-22.
   */
  readonly models?: readonly string[];
}

const POOLS: readonly (readonly [string, string])[] = [
  ['gemini-', 'gemini_models'],
  ['3p-', 'claude_gpt_models'],
];
const WINDOWS: Readonly<Record<string, UsageBucket['window']>> = { '5h': 'five_hour', weekly: 'weekly' };
const POOL_WIDE = /^(?:gemini|3p)-(?:5h|weekly)$/;
/** `Models within this group: Gemini Flash, Gemini Pro` (agy 1.5.x; spike P1-12a §7). */
const MEMBERS = /^Models within this group:\s*(.+?)\s*$/;

type Json = Record<string, unknown>;
const records = (value: unknown): Json[] =>
  Array.isArray(value)
    ? value.filter((item): item is Json => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];

/** The models a group's description lists, if it lists any. */
function membersOf(group: Json): string[] | undefined {
  const found = typeof group.description === 'string' ? MEMBERS.exec(group.description) : null;
  const names = found?.[1]
    ?.split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return names === undefined || names.length === 0 ? undefined : names;
}

function bucketOf(raw: Json, models: readonly string[] | undefined): UsageBucket | undefined {
  const { id, window, remaining_fraction: remaining, reset_time: reset } = raw;
  if (typeof id !== 'string' || typeof remaining !== 'number') return undefined;
  const poolWide = POOL_WIDE.test(id);
  return {
    id,
    pool: POOLS.find(([prefix]) => id.startsWith(prefix))?.[1],
    window: typeof window === 'string' ? WINDOWS[window] : undefined,
    used_pct: Math.round(100 * (1 - remaining) * 100) / 100,
    resets_at: remaining < 1 && typeof reset === 'string' ? reset : null,
    pool_wide: poolWide,
    ...(poolWide && models !== undefined ? { models } : {}),
  };
}

/** Every bucket of the answer; undefined when it is not the shape spike P1-12a recorded. */
export function usageBuckets(stdout: string): UsageBucket[] | undefined {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  const data = (value as { command?: { data?: { groups?: unknown } } } | null)?.command?.data;
  if (!Array.isArray(data?.groups)) return undefined;
  return records(data.groups).flatMap((group) => {
    const models = membersOf(group);
    return records(group.buckets).flatMap((raw) => bucketOf(raw, models) ?? []);
  });
}

type ReportedWindow = NonNullable<ProbeResult['windows']>[number];

/** The model a bucket that is not pool-wide caps: `gemini-argon-wtu-weekly` → `argon`. */
const modelOf = (id: string): string => id.split('-')[1] ?? id;

/**
 * The buckets as the account's windows, for the mana gauge (P1-05): every bucket of a known pool and window; a
 * bucket that caps one model (Argon) names it, so it binds only the characters on that model (§3.5); a group's
 * bucket lists the models the account puts in the group, so a model it leaves out (Argon on a Pro plan) is not
 * bound by it (P1-22).
 */
export const windowsOf = (buckets: readonly UsageBucket[]): ReportedWindow[] =>
  buckets.flatMap(({ id, pool, window, used_pct, resets_at, pool_wide, models }) =>
    pool === undefined || window === undefined
      ? []
      : [
          {
            window,
            used_pct,
            pool,
            ...(resets_at === null ? {} : { resets_at }),
            ...(pool_wide ? {} : { model: modelOf(id) }),
            ...(models === undefined ? {} : { models }),
          },
        ],
  );

/** The probe's answer: rate limited while a pool-wide bucket of a pool the tribe runs on is empty. */
export function probeOf(buckets: readonly UsageBucket[], pools: readonly string[]): ProbeResult {
  const empty = buckets.filter(
    (bucket) =>
      bucket.pool_wide && bucket.pool !== undefined && pools.includes(bucket.pool) && bucket.used_pct >= 100,
  );
  if (empty.length === 0) return { status: 'ok' };
  const resets = empty
    .map((bucket) => bucket.resets_at)
    .filter((at): at is string => at !== null)
    .sort();
  const latest = resets.at(-1);
  return {
    status: 'rate_limited',
    detail: `no mana left in ${empty.map((bucket) => bucket.id).join(', ')}`,
    ...(latest === undefined ? {} : { resets_at: latest }),
  };
}
