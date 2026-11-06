// Replaying a fake day (implementation-plan §7): the lines in order, each after the gap to the line before it,
// shortened `speed` times. The schedule is a pure function; waiting and showing are passed in, so the terminal
// (P0-10) and the herald's WebSocket (stage 2) play the same schedule, and tests never wait.
import type { Event } from '@elvaria/domain';

export interface ReplayStep {
  readonly event: Event;
  /** Milliseconds to wait before showing the line. */
  readonly waitMs: number;
}

const timeOf = (event: Event): number => Date.parse(event.ts);

/** `speed` 20 plays a day of 10 hours in 30 minutes; the first line comes at once. */
export function replaySchedule(events: readonly Event[], speed: number): ReplayStep[] {
  return events.map((event, index) => {
    const before = events[index - 1];
    const gap = before === undefined ? 0 : Math.max(0, timeOf(event) - timeOf(before));
    return { event, waitMs: Math.round(gap / speed) };
  });
}

export interface ReplaySpan {
  readonly from: string;
  readonly to: string;
  /** How long the replay takes at `speed`. */
  readonly waitMs: number;
}

export function replaySpan(events: readonly Event[], speed: number): ReplaySpan | undefined {
  const [first] = events;
  const last = events.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const waitMs = replaySchedule(events, speed).reduce((sum, { waitMs: wait }) => sum + wait, 0);
  return { from: first.ts, to: last.ts, waitMs };
}

export interface ReplayOptions {
  readonly speed: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly emit: (event: Event) => void | Promise<void>;
}

export async function replay(events: readonly Event[], options: ReplayOptions): Promise<void> {
  for (const { event, waitMs } of replaySchedule(events, options.speed)) {
    if (waitMs > 0) await options.sleep(waitMs);
    await options.emit(event);
  }
}
