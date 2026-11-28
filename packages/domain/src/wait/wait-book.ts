// The Steward's book of waits between ticks (LL-03, plans/learning-loop.md §4.1): edges, as `quest.unclaimable`'s.
// A wait seen for the first time is kept with when it was seen; once it lasted WAIT_MIN_MINUTES it gets its
// `wait.started` line, and once it is gone its `wait.ended`, with the minutes since it was first seen. The waits with
// a line are the log's (openWaitsOf), so a restarted Steward rebuilds them from it and ends, at its start, those that
// no longer hold; a wait seen and not yet written is lost with the Steward that saw it, and is seen again.
import { isEventOf } from '../schema/event/event.ts';
import { MS_PER_MINUTE, WAIT_MIN_MINUTES } from './constants.ts';
import type { Instant } from '../core/clock.ts';
import type { Ulid } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { Wait } from './tick-waits.ts';

/** A wait and when the Steward first saw it. */
export interface SeenWait {
  readonly wait: Wait;
  readonly since: Instant;
}

/** A wait with its `wait.started` line. */
export interface OpenWait extends SeenWait {
  readonly started: Ulid;
}

export interface WaitBook {
  readonly seen: readonly SeenWait[];
  readonly open: readonly OpenWait[];
}

export interface WaitEnd {
  readonly open: OpenWait;
  /** Whole minutes from `since` to the end. */
  readonly minutes: number;
}

export interface WaitStep {
  /** Seen for WAIT_MIN_MINUTES and more: their `wait.started` lines are due now. */
  readonly start: readonly SeenWait[];
  /** Waits with a line that are gone: their `wait.ended` lines are due now. */
  readonly end: readonly WaitEnd[];
  /** Seen, not for long enough yet: the book's `seen` after this tick. */
  readonly seen: readonly SeenWait[];
}

/** One wait per work and reason: the holder may change while it lasts, the wait does not. */
export const waitKeyOf = ({ reason, territory, quest, pr }: Wait): string =>
  [reason, territory, quest ?? '', pr ?? ''].join('|');

const minutesBetween = (from: number, to: number): number =>
  Math.max(0, Math.floor((to - from) / MS_PER_MINUTE));

/**
 * What changed since the book, given this tick's waits at `now`. A wait gone ends at `endAt`: `now`, or the start of
 * the Steward for the first tick after one (a wait that ended while no Steward ran ended by then at the latest).
 */
export function waitStepOf(
  book: WaitBook,
  current: readonly Wait[],
  now: Instant,
  endAt: Instant = now,
): WaitStep {
  const keys = new Set(current.map(waitKeyOf));
  const open = new Set(book.open.map(({ wait }) => waitKeyOf(wait)));
  const seenAt = new Map(book.seen.map(({ wait, since }) => [waitKeyOf(wait), since]));
  const end = book.open
    .filter(({ wait }) => !keys.has(waitKeyOf(wait)))
    .map((gone) => ({ open: gone, minutes: minutesBetween(gone.since, endAt) }));
  const fresh = current
    .filter((wait) => !open.has(waitKeyOf(wait)))
    .map((wait) => ({ wait, since: seenAt.get(waitKeyOf(wait)) ?? now }));
  const long = (seen: SeenWait): boolean => now - seen.since >= WAIT_MIN_MINUTES * MS_PER_MINUTE;
  return { start: fresh.filter(long), end, seen: fresh.filter((seen) => !long(seen)) };
}

/** The waits the log holds open: a `wait.started` line with no `wait.ended` line that names it, in log order. */
export function openWaitsOf(events: readonly Event[]): OpenWait[] {
  const open = new Map<Ulid, OpenWait>();
  for (const event of events) {
    if (isEventOf(event, 'wait.ended')) open.delete(event.data.started);
    if (!isEventOf(event, 'wait.started') || event.territory === undefined) continue;
    const { reason, since, pr, holder } = event.data;
    const wait: Wait = {
      reason,
      territory: event.territory,
      ...(event.quest === undefined ? {} : { quest: event.quest }),
      ...(pr === undefined ? {} : { pr }),
      holder,
    };
    open.set(event.id, { wait, since: Date.parse(since) as Instant, started: event.id });
  }
  return [...open.values()];
}
