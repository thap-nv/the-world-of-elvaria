// Operational disruptions are a reading of the event log (LL-01, ADR 0036): a pure function of the lines and the
// kinds of registry/disruptions.json, recomputed on every read and never stored, like titles and counts (ADR 0020).
import { inWindow } from '../metrics/window.ts';
import { MS_PER_MINUTE, MS_PER_SECOND } from './constants.ts';
import { codeAt, meetsMatch, valueAt } from './match.ts';
import type { DisruptionKindId } from '../core/ids.ts';
import type { MetricsWindow } from '../metrics/window.ts';
import type { DisruptionKind, SequenceDisruptionKind } from '../schema/disruption/disruption-kind.ts';
import type { Event } from '../schema/event/event.ts';

type EventId = Event['id'];

export interface Disruption {
  readonly kind: DisruptionKindId;
  readonly territory?: NonNullable<Event['territory']>;
  readonly quest?: NonNullable<Event['quest']>;
  /** The time of the first and of the last event that proves it. */
  readonly from: string;
  readonly to: string;
  /** A wait (a sequence with after_minutes): whole minutes between its two events. */
  readonly minutes?: number;
  /** The code at the kind's `cause` path, when the event carries one. */
  readonly cause?: string;
  /** The ids of the events that prove it, in log order: never empty. */
  readonly evidence: readonly [EventId, ...EventId[]];
}

interface Found {
  readonly at: number;
  readonly order: number;
  readonly disruption: Disruption;
}

const timeOf = (event: Event): number => Date.parse(event.ts);

/** Envelope fields, from the first event that has them. */
function placeOf(events: readonly Event[]): Pick<Disruption, 'territory' | 'quest'> {
  const territory = events.find((event) => event.territory !== undefined)?.territory;
  const quest = events.find((event) => event.quest !== undefined)?.quest;
  return { ...(territory === undefined ? {} : { territory }), ...(quest === undefined ? {} : { quest }) };
}

function eventFinds(
  events: readonly Event[],
  kind: Extract<DisruptionKind, { shape: 'event' }>,
  window: MetricsWindow,
) {
  return events.flatMap((event, at): Omit<Found, 'order'>[] => {
    if (!inWindow(window, event.ts) || !meetsMatch(event, kind)) return [];
    const cause = codeAt(event, kind.cause);
    const disruption: Disruption = {
      kind: kind.id,
      ...placeOf([event]),
      from: event.ts,
      to: event.ts,
      ...(cause === undefined ? {} : { cause }),
      evidence: [event.id],
    };
    return [{ at, disruption }];
  });
}

const keyOf = (event: Event, paths: readonly string[]): readonly unknown[] | undefined => {
  const values = paths.map((path) => valueAt(event, path));
  return values.some((value) => value === undefined || value === null) ? undefined : values;
};

const sameKey = (a: readonly unknown[], b: readonly unknown[] | undefined): boolean =>
  b !== undefined && a.every((value, index) => value === b[index]);

/**
 * The event that closes the sequence opened at `at`: the first later `then` with the same key, unless an `unless`
 * with that key comes first. Lines are in log order, which is time order: a sequence with within_seconds stops
 * looking once a line is past its bound.
 */
function closingOf(
  events: readonly Event[],
  at: number,
  first: Event,
  kind: SequenceDisruptionKind,
): Event | undefined {
  const key = keyOf(first, kind.same);
  if (key === undefined) return undefined;
  const bound =
    kind.within_seconds === undefined ? Infinity : timeOf(first) + kind.within_seconds * MS_PER_SECOND;
  for (const event of events.slice(at + 1)) {
    if (timeOf(event) > bound) return undefined;
    const keyed = sameKey(key, keyOf(event, kind.same));
    if (keyed && kind.unless !== undefined && meetsMatch(event, kind.unless)) return undefined;
    if (keyed && meetsMatch(event, kind.then)) return event;
  }
  return undefined;
}

function sequenceOf(first: Event, then: Event, kind: SequenceDisruptionKind): Disruption | undefined {
  const gap = timeOf(then) - timeOf(first);
  if (kind.after_minutes !== undefined && gap < kind.after_minutes * MS_PER_MINUTE) return undefined;
  const cause = codeAt({ first, then }, kind.cause);
  return {
    kind: kind.id,
    ...placeOf([first, then]),
    from: first.ts,
    to: then.ts,
    ...(kind.after_minutes === undefined ? {} : { minutes: Math.floor(gap / MS_PER_MINUTE) }),
    ...(cause === undefined ? {} : { cause }),
    evidence: [first.id, then.id],
  };
}

/**
 * A sequence matches when its first event is in the window (the later one may be past it: the caller reads lines
 * beyond the window's end, ADR 0036 edge cases).
 */
function sequenceFinds(events: readonly Event[], kind: SequenceDisruptionKind, window: MetricsWindow) {
  return events.flatMap((event, at): Omit<Found, 'order'>[] => {
    if (!inWindow(window, event.ts) || !meetsMatch(event, kind.first)) return [];
    const then = closingOf(events, at, event, kind);
    const disruption = then === undefined ? undefined : sequenceOf(event, then, kind);
    return disruption === undefined ? [] : [{ at, disruption }];
  });
}

/**
 * Every disruption of `kinds` whose (first) event lies in `window`, in log order of that event, then in the order
 * of the kinds. Two kinds that match the same event are both reported.
 */
export function disruptionsOf(
  events: readonly Event[],
  kinds: readonly DisruptionKind[],
  window: MetricsWindow = {},
): Disruption[] {
  const found = kinds.flatMap((kind, order): Found[] =>
    (kind.shape === 'event' ? eventFinds(events, kind, window) : sequenceFinds(events, kind, window)).map(
      (entry) => ({ ...entry, order }),
    ),
  );
  return found.sort((a, b) => a.at - b.at || a.order - b.order).map((entry) => entry.disruption);
}
