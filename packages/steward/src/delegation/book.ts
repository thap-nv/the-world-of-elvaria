// The breaker of the seal delegation as the Steward keeps it (implementation-plan §3.16.7, ADR 0023; PS-08g): the
// territories whose delegation is suspended, rebuilt from the log at start (sealSuspendedOf, so a restart keeps a
// suspension) and kept as the Steward writes the two lines (suspend.ts, inbox/delegation-commands.ts). The quests'
// making, their submits and verdicts, the snapshot and the digest read the book through the domain's sealPolicyOf
// (as `elvaria digest` reads the log's lines, fix/run-221-followups), the places PS-08b left for it. Apart from suspend.ts, which writes and rings through the tick's Context: the Context and
// the world hold this book, and a book that imported them back would close a cycle.
import { sealSuspendedOf } from '@elvaria/domain';
import type { Event, SealSuspension } from '@elvaria/domain';

export interface DelegationBook {
  /** The territories whose delegation the breaker suspended, by id. */
  suspensions: readonly SealSuspension[];
}

export const createDelegationBook = (): DelegationBook => ({ suspensions: [] });

export function recoverDelegation(book: DelegationBook, events: readonly Event[]): void {
  book.suspensions = sealSuspendedOf(events);
}

/** The book with `suspension` in place of its territory's, or without its territory when undefined. */
export function setSuspension(
  book: DelegationBook,
  territory: SealSuspension['territory'],
  suspension: SealSuspension | undefined,
): void {
  const others = book.suspensions.filter((held) => held.territory !== territory);
  book.suspensions = (suspension === undefined ? others : [...others, suspension]).toSorted((a, b) =>
    a.territory.localeCompare(b.territory),
  );
}
