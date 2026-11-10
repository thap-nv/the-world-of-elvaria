// `mana.warning` (implementation-plan §3.5, P1-22): a gauge that reaches warn_margin_pct points below the cap warns
// the owner once, before the world stops taking work there; it may warn again only after its window reset or its
// figure fell back. Per gauge, so Argon's weekly cap warns on its own (about 6–7 % per Argon session, phase-1 report
// §4.1: the default 10-point margin comes at least one session ahead).
import { current, sameGauge } from './reading.ts';
import { manaWarningOf } from './state.ts';
import type { Instant } from '../core/clock.ts';
import type { ManaReading } from './reading.ts';
import type { ManaConfig } from './state.ts';

export interface Warnings {
  /** Readings that warn now: their gauge reached the warning share and had not warned yet. */
  readonly fresh: readonly ManaReading[];
  /** The gauges warned so far, as the reading that warned (pass them back next time). */
  readonly warned: readonly ManaReading[];
}

/**
 * The warnings of `readings`, given the gauges `warned` before. A spent gauge neither warns nor forgets (its sleep
 * tells the owner); a gauge below the warning share, or whose window reset, may warn again later.
 */
export function warningsOf(
  readings: readonly ManaReading[],
  warned: readonly ManaReading[],
  cfg: ManaConfig,
  now: Instant,
): Warnings {
  const level = manaWarningOf(cfg);
  const fresh: ManaReading[] = [];
  let kept = warned.filter((reading) => current(reading, now));
  for (const reading of readings) {
    if (reading.exhausted && current(reading, now)) continue;
    const known = kept.some((old) => sameGauge(old, reading));
    const high = current(reading, now) && (reading.used_pct ?? 0) >= level;
    if (high && !known) {
      fresh.push(reading);
      kept = [...kept, reading];
    }
    if (!high) kept = kept.filter((old) => !sameGauge(old, reading));
  }
  return { fresh, warned: kept };
}
