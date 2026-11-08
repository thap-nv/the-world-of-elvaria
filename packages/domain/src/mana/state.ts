// decideManaState: what a gauge may do now, from its readings (implementation-plan §3.5, ADR 0009); manaStateOf:
// what a character may do, from every gauge that binds it (P1-22). The world uses mana up to the owner's cap and
// always leaves the king's reserve.
import { parseInstant } from '../core/clock.ts';
import { binds, keyOf, sameKey } from './pool.ts';
import { modelsOf } from './reading.ts';
import type { Instant } from '../core/clock.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Tribe } from '../schema/tribe.ts';
import type { PoolKey } from '../world/mana-view.ts';
import type { ManaReading } from './reading.ts';

export const MANA_STATES = ['ok', 'warning', 'closed', 'asleep'] as const;
/**
 * ok and warning take new sessions; closed takes none while running ones go on; asleep is out of mana until a
 * probe finds it back (the Steward pauses what runs there).
 */
export type ManaState = (typeof MANA_STATES)[number];

export type ManaConfig = Pick<Kingdom['mana'], 'cap_pct' | 'king_reserve_pct' | 'warn_margin_pct'>;

type Tribes = readonly Pick<Tribe, 'id' | 'pools'>[];
type Holder = Pick<Character, 'tribe' | 'model'>;

/** The share of a window at which the world stops taking work: min(cap, 100 − king's reserve). */
export const manaThresholdOf = (cfg: ManaConfig): number => Math.min(cfg.cap_pct, 100 - cfg.king_reserve_pct);

/** The share from which a window warns: warn_margin_pct points below the threshold. */
export const manaWarningOf = (cfg: ManaConfig): number => manaThresholdOf(cfg) - cfg.warn_margin_pct;

/** A reading whose window has reset since says nothing any more. */
export function current(reading: Pick<ManaReading, 'resets_at'>, now: Instant): boolean {
  if (reading.resets_at === null) return true;
  const resets = parseInstant(reading.resets_at);
  return !resets.ok || resets.value > now;
}

/** A spent window sleeps; otherwise the fullest window decides. */
function stateOfLive(live: readonly ManaReading[], cfg: ManaConfig): ManaState {
  if (live.some(({ exhausted }) => exhausted)) return 'asleep';
  const used = Math.max(0, ...live.map(({ used_pct }) => used_pct ?? 0));
  if (used >= manaThresholdOf(cfg)) return 'closed';
  return used >= manaWarningOf(cfg) ? 'warning' : 'ok';
}

/**
 * The state of the gauge `key`: the whole pool (its group's windows, the caps of one model left out), or the cap of
 * `key.model`. What sleeps and wakes is a gauge (P1-22).
 */
export const decideManaState = (
  readings: readonly ManaReading[],
  key: PoolKey,
  cfg: ManaConfig,
  now: Instant,
): ManaState =>
  stateOfLive(
    readings.filter((reading) => sameKey(keyOf(reading), key) && current(reading, now)),
    cfg,
  );

/** The state for a character: every current reading that binds its model (its group's windows, its own caps). */
export const manaStateOf = (
  readings: readonly ManaReading[],
  tribes: Tribes,
  character: Holder,
  cfg: ManaConfig,
  now: Instant,
): ManaState =>
  stateOfLive(
    readings.filter((reading) => binds(tribes, reading, character) && current(reading, now)),
    cfg,
  );

/**
 * Whether a gauge asleep binds the character: a model's cap its slug names, a pool whose models the readings list
 * it among (or, when none list them, the pool the prefix table charges it to).
 */
export const asleepFor = (
  asleep: readonly PoolKey[],
  readings: readonly ManaReading[],
  tribes: Tribes,
  character: Holder,
): boolean =>
  asleep.some((key) => {
    const models = key.model === undefined ? modelsOf(readings, key) : undefined;
    return binds(tribes, { ...key, ...(models === undefined ? {} : { models }) }, character);
  });

/** The gauges spent now that bind the character, each once: what a usage limit it hit put to sleep. */
export function spentFor(
  readings: readonly ManaReading[],
  tribes: Tribes,
  character: Holder,
  now: Instant,
): ManaReading[] {
  const spent = readings.filter(
    (reading) => reading.exhausted && current(reading, now) && binds(tribes, reading, character),
  );
  return spent.filter((reading, index) => spent.findIndex((other) => sameKey(other, reading)) === index);
}

/** Whether a gauge in `state` opens new sessions. */
export const admits = (state: ManaState): boolean => state === 'ok' || state === 'warning';
