// Valid events for the specs, built through the domain's EventSchema so a fixture can never be malformed.
// Times are in the kingdom's zone (+07:00, no daylight saving), as a writer stamps them (§2.1).
import { EventSchema, formatUlid, zonedTime } from '@elvaria/domain';
import type { Event, Instant } from '@elvaria/domain';

export const TZ = 'Asia/Ho_Chi_Minh';
export const QUEST = 'q_20261106_7k3m2a';

const zone = zonedTime(TZ);
if (!zone.ok) throw new Error(`fixture time zone ${TZ} is unknown`);
const { format } = zone.value;

/** An Instant from an ISO date-time with offset. */
export const instantOf = (iso: string): Instant => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`not a date-time: ${iso}`);
  // Date.parse returned a whole number of milliseconds.
  return ms as Instant;
};

export const DAY_1 = instantOf('2026-11-06T08:00:00+07:00');
export const DAY_2 = instantOf('2026-11-07T08:00:00+07:00');
export const DAY_3 = instantOf('2026-11-08T08:00:00+07:00');

/** `ms` after `instant`. */
export const plus = (instant: Instant, ms: number): Instant =>
  // A whole number of milliseconds after an Instant is an Instant.
  (instant + ms) as Instant;

/** One `agent.tool` event at `instant`; `n` makes the id unique and shows up in the command. */
export function makeEvent(instant: Instant, n: number, change: Record<string, unknown> = {}): Event {
  return EventSchema.parse({
    v: 1,
    id: formatUlid(instant, BigInt(n)),
    ts: format(instant),
    type: 'agent.tool',
    actor: { kind: 'character', id: 'thorn' },
    quest: QUEST,
    attempt: 1,
    territory: 'dc1-se-team',
    data: { tool: 'bash', command: `pnpm test --filter case-${n}`, exit: 0 },
    ...change,
  });
}

/** `count` events from `start`, `stepMs` apart, numbered from `first`. */
export function makeEvents(count: number, start: Instant, stepMs = 1000, first = 0): Event[] {
  return Array.from({ length: count }, (_, index) => makeEvent(plus(start, index * stepMs), first + index));
}

export const idsOf = (events: readonly Event[]): string[] => events.map((event) => event.id);
