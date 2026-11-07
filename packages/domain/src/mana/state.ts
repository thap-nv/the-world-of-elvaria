// decideManaState: what a pool may do now, from its readings (implementation-plan §3.5, ADR 0009). The world
// uses mana up to the owner's cap and always leaves the king's reserve.
import { parseInstant } from '../core/clock.ts';
import type { Instant } from '../core/clock.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { PoolKey } from '../world/mana-view.ts';
import type { ManaReading } from './reading.ts';

export const MANA_STATES = ['ok', 'warning', 'closed', 'asleep'] as const;
/**
 * ok and warning take new sessions; closed takes none while running ones go on; asleep is out of mana until a
 * probe finds it back (the Steward pauses what runs there).
 */
export type ManaState = (typeof MANA_STATES)[number];

export type ManaConfig = Pick<Kingdom['mana'], 'cap_pct' | 'king_reserve_pct' | 'warn_margin_pct'>;

/** The share of a window at which the world stops taking work: min(cap, 100 − king's reserve). */
export const manaThresholdOf = (cfg: ManaConfig): number => Math.min(cfg.cap_pct, 100 - cfg.king_reserve_pct);

/** Whether `reading` binds a character on `model`: a pool-wide one binds all; a model's cap, its own slug words. */
export const bindsModel = (reading: Pick<ManaReading, 'model'>, model: string | undefined): boolean =>
  reading.model === undefined || model?.toLowerCase().split('-').includes(reading.model) === true;

/** A reading whose window has reset since says nothing any more. */
function current(reading: ManaReading, now: Instant): boolean {
  if (reading.resets_at === null) return true;
  const resets = parseInstant(reading.resets_at);
  return !resets.ok || resets.value > now;
}

/**
 * The state of pool `key` for a character on `model` (omit it for the pool as a whole: caps of one model left
 * out). A spent window puts the pool to sleep; otherwise the fullest window decides.
 */
export function decideManaState(
  readings: readonly ManaReading[],
  key: PoolKey,
  cfg: ManaConfig,
  now: Instant,
  model?: string,
): ManaState {
  const live = readings.filter(
    (reading) =>
      reading.tribe === key.tribe &&
      reading.pool === key.pool &&
      bindsModel(reading, model) &&
      current(reading, now),
  );
  if (live.some(({ exhausted }) => exhausted)) return 'asleep';
  const used = Math.max(0, ...live.map(({ used_pct }) => used_pct ?? 0));
  const threshold = manaThresholdOf(cfg);
  if (used >= threshold) return 'closed';
  return used >= threshold - cfg.warn_margin_pct ? 'warning' : 'ok';
}

/** Whether a pool in `state` opens new sessions. */
export const admits = (state: ManaState): boolean => state === 'ok' || state === 'warning';
