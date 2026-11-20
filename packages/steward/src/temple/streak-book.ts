// Like the delegation book: recovered at start, then kept as the Steward appends character lines.
import { foldStreakSuspended, streakSuspendedOf } from '@elvaria/domain';
import type { CharacterId, Event } from '@elvaria/domain';

export interface StreakBook {
  suspended: ReadonlySet<CharacterId>;
}

export const createStreakBook = (): StreakBook => ({ suspended: new Set() });

export function recoverStreak(book: StreakBook, events: readonly Event[]): void {
  book.suspended = new Set(streakSuspendedOf(events));
}

export function recordStreak(book: StreakBook, event: Event): void {
  book.suspended = foldStreakSuspended(book.suspended, event);
}
