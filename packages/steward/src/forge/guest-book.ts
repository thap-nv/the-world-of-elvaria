// The guest entries of the merge queues (CM-07, ADR 0032, plans/check-modes.md "mục khách"): the pull requests the
// owner's own sessions put in their territory's queue (`enqueue_branch`). Those that wait are drawn from the log at
// start (guestsWaitingOf) and follow each line the Steward writes after (noteGuest, from the recorder), so a guest is
// in the book from its `delivery.enqueued` until its `delivery.guest_merged` or `delivery.guest_refused`. planTick
// sees them (KingdomSnapshot.guests); the territories where one is tried now hold their lane and a slot of the
// background (BackgroundWork.guests). A try runs outside the tick, one per territory at a time, as a look at the base
// branch does (looks.ts); the Steward's stop aborts it and records nothing, and the next Steward tries it from the
// start. What a try does is guest.ts's: this table knows no tick's Context, which holds it.
import { guestsWaitingOf, isEventOf } from '@elvaria/domain';
import type { Event, GuestEntry, TerritoryId } from '@elvaria/domain';

import type { Logger } from '../types.ts';

export interface GuestBook {
  /** The guests that wait, in the order they came, the one being tried included until its line is written. */
  waiting(): GuestEntry[];
  /** The territories where a guest is tried now. */
  running(): TerritoryId[];
  /** Starts the try `work` of `guest` outside the tick, unless one runs at its territory. */
  start(guest: GuestEntry, work: (signal: AbortSignal) => Promise<void>): void;
  /** Resolves once no try runs. */
  idle(): Promise<void>;
  /** Aborts the tries and waits for them to end (the Steward stops). */
  stop(): Promise<void>;
  /** The log's guests, in place of what the book held. */
  recover(events: readonly Event[]): void;
  /** A line the Steward wrote: a guest comes or goes. */
  note(event: Event): void;
}

const keyOf = ({ territory, pr }: { territory: TerritoryId; pr: number }): string => `${territory}#${pr}`;
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `ended` is told when a try ends on its own: the Steward ticks then, so its lane goes on at once (P1-10b). */
export function createGuestBook(log: Logger, ended: () => void = () => undefined): GuestBook {
  const waiting = new Map<string, GuestEntry>();
  const running = new Map<TerritoryId, AbortController>();
  const live = new Set<Promise<void>>();
  return {
    waiting: () => [...waiting.values()],
    running: () => [...running.keys()],
    start: (guest, work) => {
      if (running.has(guest.territory)) return;
      const control = new AbortController();
      running.set(guest.territory, control);
      const done = work(control.signal)
        .catch((error: unknown) => {
          log.warn(`steward: the guest #${guest.pr} of ${guest.territory} stopped: ${messageOf(error)}`);
        })
        .then(() => {
          running.delete(guest.territory);
          if (!control.signal.aborted) ended();
        });
      live.add(done);
      void done.finally(() => live.delete(done));
    },
    idle: async () => {
      await Promise.all(live);
    },
    stop: async () => {
      for (const control of running.values()) control.abort();
      await Promise.all(live);
    },
    recover: (events) => {
      waiting.clear();
      for (const guest of guestsWaitingOf(events)) waiting.set(keyOf(guest), guest);
    },
    note: (event) => {
      if (isEventOf(event, 'delivery.enqueued')) {
        const guest = { ...event.data, at: event.ts };
        if (!waiting.has(keyOf(guest))) waiting.set(keyOf(guest), guest);
      } else if (isEventOf(event, 'delivery.guest_merged') || isEventOf(event, 'delivery.guest_refused'))
        waiting.delete(keyOf(event.data));
    },
  };
}
