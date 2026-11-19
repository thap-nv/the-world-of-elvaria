// The Temple's count as the Steward keeps it (PS-12f, temple-first plan PS-12d: "JobView carries what the Steward
// counted from the log"): templeLogOf's fold over the whole log at start, then over the lines written since, at each
// tick, whoever wrote them (the Steward's verdicts and suspensions, the Temple job's `temple.ran`, `elvaria temple
// run`'s). A job's `ready` reads no log, and reading only the new lines costs a tick little.
import { EMPTY_TEMPLE_FOLD, foldTempleLog, templeLogOfFold } from '@elvaria/domain';
import type { TempleFold, TempleLog } from '@elvaria/domain';
import type { EventBatch, EventCursor, EventLog } from '@elvaria/eventlog';

export interface TempleBook {
  fold: TempleFold;
  /** Where the next read starts; none before the first: the whole log. */
  cursor: EventCursor | undefined;
}

export const createTempleBook = (): TempleBook => ({ fold: EMPTY_TEMPLE_FOLD, cursor: undefined });

/** At start: the log the Steward read, folded from nothing. */
export function recoverTemple(book: TempleBook, log: Pick<EventBatch, 'events' | 'cursor'>): void {
  book.fold = foldTempleLog(EMPTY_TEMPLE_FOLD, log.events);
  book.cursor = log.cursor;
}

/** The count now: the lines written since the last read, folded on. A line the log cannot read is left out. */
export async function templeLogNow(book: TempleBook, events: EventLog): Promise<TempleLog> {
  const batch = await events.read(book.cursor);
  book.fold = foldTempleLog(book.fold, batch.events);
  book.cursor = batch.cursor;
  return templeLogOfFold(book.fold);
}
