// Guest entries of the merge queue (CM-07, ADR 0032, plans/check-modes.md "Elvaria sang `pr_merge` và mục khách"): a
// pull request the owner's own session opened, put in its territory's queue by `enqueue_branch`. A guest waits from
// its `delivery.enqueued` line until its `delivery.guest_merged` or `delivery.guest_refused` (no file of its own, as
// sealSuspendedOf reads the delegation's breaker). It shares its territory's lane with the quests (busyOf): it goes
// after the quests whose delivery was due when it came (delivered before its line), and the quests delivered after it
// wait for it; one guest at a time per territory, in the order they came, and none while the default branch is red.
import { isEventOf } from '../schema/event/event.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { Quest } from '../schema/quest/quest.ts';

export interface GuestEntry {
  readonly territory: TerritoryId;
  readonly pr: number;
  /** When the owner enqueued it (its line's ts): the quests due then go first. */
  readonly at: string;
}

const keyOf = (territory: TerritoryId, pr: number): string => `${territory}#${pr}`;

/** The guests that wait, in the order they came: enqueued, neither merged nor refused since. */
export function guestsWaitingOf(events: readonly Event[]): GuestEntry[] {
  const waiting = new Map<string, GuestEntry>();
  for (const event of events) {
    if (isEventOf(event, 'delivery.enqueued')) {
      const { territory, pr } = event.data;
      if (!waiting.has(keyOf(territory, pr)))
        waiting.set(keyOf(territory, pr), { territory, pr, at: event.ts });
    } else if (isEventOf(event, 'delivery.guest_merged') || isEventOf(event, 'delivery.guest_refused'))
      waiting.delete(keyOf(event.data.territory, event.data.pr));
  }
  return [...waiting.values()];
}

/** Whether pull request `pr` of `territory` waits already: the owner's `enqueue_branch` is refused then. */
export const guestWaits = (guests: readonly GuestEntry[], territory: TerritoryId, pr: number): boolean =>
  guests.some((guest) => guest.territory === territory && guest.pr === pr);

/** The first guest that waits on each territory: the only one its lane may take. */
export function firstGuestsOf(guests: readonly GuestEntry[] = []): Map<TerritoryId, GuestEntry> {
  const first = new Map<TerritoryId, GuestEntry>();
  for (const guest of guests) if (!first.has(guest.territory)) first.set(guest.territory, guest);
  return first;
}

/** Whether done quest `quest` was due before `guest` came: delivered (done.deliver) no later than its line. */
export const aheadOfGuest = (quest: Pick<Quest, 'deliverable'>, guest: GuestEntry): boolean => {
  const delivered = quest.deliverable.delivered_at;
  return delivered !== undefined && Date.parse(delivered) <= Date.parse(guest.at);
};
