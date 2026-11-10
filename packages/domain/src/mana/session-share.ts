// What one session takes of a mana window (implementation-plan §3.5, ADR 0009; P1-48, P1-22 (b)). The world stops
// taking work at the cap, but a session opened just under it runs on past it and meets the account's limit halfway:
// Argon's weekly cap drops 6–7 % a session (phase-1 report §4.1). So a gauge closes as soon as one more session would
// take a window to the cap (manaStateOf), by the share a session was seen to take of it: the rise between two readings
// of the window over the sessions the gauge binds that ended between them. A running session that has not ended adds
// to the rise without being counted: the share comes out larger, never smaller, which is the safe side.
import { parseInstant } from '../core/clock.ts';
import { PCT_DECIMALS_FACTOR, SESSION_SHARE_DEFAULT_PCT } from './constants.ts';
import { binds, keyOf } from './pool.ts';
import { current, sameGauge, withReadings } from './reading.ts';
import type { Instant } from '../core/clock.ts';
import type { TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Tribe } from '../schema/tribe.ts';
import type { PoolKey } from '../world/mana-view.ts';
import type { ManaReading, ManaWindow } from './reading.ts';

/** The largest share of one window of one gauge that a session was seen to take. */
export interface SessionShare extends PoolKey {
  readonly window: ManaWindow;
  /** 0–100. */
  readonly pct: number;
}

/** A session that ended, on the model of its character now: attempt_log keeps no model (as for the estimate). */
export interface EndedSession {
  readonly at: Instant;
  readonly tribe: TribeId;
  readonly model: string;
}

type Tribes = readonly Pick<Tribe, 'id' | 'pools'>[];

/** The sessions of `quests` that ended, a character's; a script run has none and takes no mana. */
export function endedSessionsOf(
  quests: readonly Pick<Quest, 'attempt_log'>[],
  characters: readonly Pick<Character, 'id' | 'tribe' | 'model'>[],
): EndedSession[] {
  const byId = new Map(characters.map((character) => [character.id, character]));
  return quests.flatMap(({ attempt_log: log }) =>
    log.flatMap((entry) => {
      const holder = entry.character === null ? undefined : byId.get(entry.character);
      const end = entry.ended_at === undefined ? undefined : parseInstant(entry.ended_at);
      if (holder === undefined || end?.ok !== true) return [];
      return [{ at: end.value, tribe: holder.tribe, model: holder.model }];
    }),
  );
}

const round = (pct: number): number => Math.round(pct * PCT_DECIMALS_FACTOR) / PCT_DECIMALS_FACTOR;

/**
 * The share of the window each session took from `before` to `after`, two readings of one gauge's window by the same
 * source (an estimate is never set against the account's own figure): the rise over the sessions the gauge binds that
 * ended between them. Undefined when none ended, a figure is missing, or the window reset in between.
 */
export function sessionShareOf(
  before: ManaReading,
  after: ManaReading,
  ended: readonly EndedSession[],
  tribes: Tribes,
): number | undefined {
  if (!sameGauge(before, after) || before.source !== after.source) return undefined;
  if (before.used_pct === null || after.used_pct === null) return undefined;
  const from = parseInstant(before.observed_at);
  const to = parseInstant(after.observed_at);
  if (!from.ok || !to.ok || !current(before, to.value)) return undefined;
  const gauge = { ...keyOf(after), ...(after.models === undefined ? {} : { models: after.models }) };
  const count = ended.filter(
    ({ at, tribe, model }) => at > from.value && at <= to.value && binds(tribes, gauge, { tribe, model }),
  ).length;
  return count === 0 ? undefined : round(Math.max(0, after.used_pct - before.used_pct) / count);
}

/** One window of one gauge: a reading's, or a share's. */
type WindowKey = Pick<ManaReading, 'tribe' | 'pool' | 'window' | 'model'>;

const sameWindow = (share: SessionShare, window: WindowKey): boolean =>
  share.tribe === window.tribe &&
  share.pool === window.pool &&
  share.window === window.window &&
  share.model === window.model;

/** `shares` with `pct` measured on one window (a reading's, or a share's): the largest share seen stands. */
export function withSessionShare(
  shares: readonly SessionShare[],
  window: WindowKey,
  pct: number,
): SessionShare[] {
  const old = shares.find((share) => sameWindow(share, window));
  if (old !== undefined && old.pct >= pct) return [...shares];
  const fresh = { ...keyOf(window), window: window.window, pct };
  return [...shares.filter((share) => share !== old), fresh];
}

/**
 * The shares `history` tells, its readings in the order they were taken (the log's `mana.level` lines at a start):
 * each set against the one before it of the same window.
 */
export function sharesOfHistory(
  history: readonly ManaReading[],
  ended: readonly EndedSession[],
  tribes: Tribes,
): SessionShare[] {
  let shares: SessionShare[] = [];
  let last: ManaReading[] = [];
  for (const after of history) {
    const before = last.find((reading) => sameGauge(reading, after));
    const pct = before === undefined ? undefined : sessionShareOf(before, after, ended, tribes);
    if (pct !== undefined) shares = withSessionShare(shares, after, pct);
    last = withReadings(last, [after]);
  }
  return shares;
}

/**
 * The share of `reading`'s window one more session is taken to need: the largest measured, or
 * SESSION_SHARE_DEFAULT_PCT before any. Never more than warn_margin_pct: the gauge has warned before it closes, and
 * one whose sessions each take a lot still opens below the warning instead of never again.
 */
export function shareAheadOf(
  shares: readonly SessionShare[],
  reading: ManaReading,
  cfg: Pick<Kingdom['mana'], 'warn_margin_pct'>,
): number {
  const measured = shares.find((share) => sameWindow(share, reading))?.pct;
  return Math.min(measured ?? SESSION_SHARE_DEFAULT_PCT, cfg.warn_margin_pct);
}
