// One reading of a mana gauge (implementation-plan §3.5, ADR 0009): one per (pool, window), and one more for a
// window that caps a single model (Claude's `Current week (Fable)`, Antigravity's Argon bucket).
import type { TribeId } from '../core/ids.ts';
import type { EVENT_DATA_SCHEMAS } from '../schema/event/event-data.ts';
import type { PoolId } from './pool.ts';
import type { z } from 'zod';

type LevelShape = (typeof EVENT_DATA_SCHEMAS)['mana.level']['shape'];
/** The words of `mana.level`, so a reading and its event line never disagree. */
export type ManaWindow = z.infer<LevelShape['window']>;
export type ManaSource = z.infer<LevelShape['source']>;

export interface ManaReading {
  readonly tribe: TribeId;
  readonly pool: PoolId;
  readonly window: ManaWindow;
  /** 0–100; null when only the end of the mana is known (a usage-limit signal without a figure). */
  readonly used_pct: number | null;
  /** ISO 8601; once past, the reading says nothing any more. */
  readonly resets_at: string | null;
  readonly source: ManaSource;
  readonly observed_at: string;
  /** The window is spent: a usage-limit signal, or a reading at 100 %. */
  readonly exhausted: boolean;
  /** Lower-case name of the one model the window caps (`fable`, `argon`); absent for the whole pool. */
  readonly model?: string;
  /**
   * The models the account says share the window (`Gemini Flash`, `Gemini Pro`): the group it binds (P1-22). Absent
   * when the account does not say; POOL_MODEL_PREFIXES then decides (poolOf).
   */
  readonly models?: readonly string[];
}

/** A window the account reported, before the Steward knows which tribe asked (runner-core's UsageReading). */
export interface ReportedWindow {
  readonly window: ManaWindow;
  readonly used_pct: number;
  readonly resets_at?: string;
  /** The account's pool; absent for a one-pool account. */
  readonly pool?: string;
  readonly model?: string;
  /** The models of the window's group, as the account names them (agy `/usage`: "Models within this group: …"). */
  readonly models?: readonly string[];
}

/** A reported window as the tribe's reading, observed at `at` (`rate_limits`: the account's own figure). */
export const readingOf = (tribe: TribeId, window: ReportedWindow, at: string): ManaReading => ({
  tribe,
  pool: window.pool ?? tribe,
  window: window.window,
  used_pct: window.used_pct,
  resets_at: window.resets_at ?? null,
  source: 'rate_limits',
  observed_at: at,
  exhausted: window.used_pct >= 100,
  ...(window.model === undefined ? {} : { model: window.model.toLowerCase() }),
  ...(window.models === undefined ? {} : { models: window.models }),
});

/** Readings are replaced per (tribe, pool, window, model): the latest one of each stands. */
export const sameGauge = (a: ManaReading, b: ManaReading): boolean =>
  a.tribe === b.tribe && a.pool === b.pool && a.window === b.window && a.model === b.model;

/**
 * The models the account last said share `key`'s group, from the readings of the whole pool; undefined when no
 * reading says (a pool asleep is then bound by the prefix table, as its readings would be).
 */
export const modelsOf = (
  readings: readonly ManaReading[],
  key: Pick<ManaReading, 'tribe' | 'pool'>,
): readonly string[] | undefined =>
  readings.findLast(
    (reading) =>
      reading.tribe === key.tribe &&
      reading.pool === key.pool &&
      reading.model === undefined &&
      reading.models !== undefined,
  )?.models;

/** `readings` with `fresh` in place of the ones they replace. */
export const withReadings = (
  readings: readonly ManaReading[],
  fresh: readonly ManaReading[],
): ManaReading[] => [
  ...readings.filter((old) => !fresh.some((reading) => sameGauge(old, reading))),
  ...fresh,
];
