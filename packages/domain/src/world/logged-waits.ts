// The Steward's notices that only a line of the log says (P2-04): an open quest nobody can take (`quest.unclaimable`,
// §3.1), a quest in review waiting for a judge (`quest.judge_wait`), a tribe held by its CLI (`tribe.held`). Each is in
// force from its line until a line says it is gone (`reason: null`, `hold: null`) or, for a quest, until a later line
// moves the quest (a judge's session, the owner's cancel): the Steward writes no line then, as the move says it. The
// running Steward keeps the same books in memory and rebuilds them from here at start, so a restart rings no bell again.
import { isEventOf } from '../schema/event/event.ts';
import { isQuestLogType } from './quest-log-type.ts';
import type { QuestId, TribeId } from '../core/ids.ts';
import type { EventData } from '../schema/event/event-data.ts';
import type { Event } from '../schema/event/event.ts';

export type UnclaimableNote = EventData<'quest.unclaimable'>;
export type JudgeWaitNote = EventData<'quest.judge_wait'>;
export type TribeHeldNote = EventData<'tribe.held'>;

/** The owner's edit leaves the quest where it was, so it ends no notice; the notices themselves move nothing. */
const movesQuest = (type: string): boolean => isQuestLogType(type) && type !== 'quest.edited';

/** The notices of `type` in force, by quest, as the log leaves them. */
function questNotesOf<T extends 'quest.unclaimable' | 'quest.judge_wait'>(
  events: readonly Event[],
  type: T,
  gone: (data: EventData<T>) => boolean,
): Map<QuestId, EventData<T>> {
  const notes = new Map<QuestId, EventData<T>>();
  for (const event of events) {
    if (event.quest === undefined) continue;
    if (isEventOf(event, type)) {
      if (gone(event.data)) notes.delete(event.quest);
      else notes.set(event.quest, event.data);
    } else if (movesQuest(event.type)) notes.delete(event.quest);
  }
  return notes;
}

/** The open quests the log last named unclaimable, with what it said; never one with `reason: null`. */
export const unclaimableOf = (events: readonly Event[]): Map<QuestId, UnclaimableNote> =>
  questNotesOf(events, 'quest.unclaimable', ({ reason }) => reason === null);

/** The quests the log last said wait for a judge, with why; never one with `reason: null`. */
export const judgeWaitsOf = (events: readonly Event[]): Map<QuestId, JudgeWaitNote> =>
  questNotesOf(events, 'quest.judge_wait', ({ reason }) => reason === null);

/** The tribes the log last said are held, with the hold; never one with `hold: null`. */
export function tribeHoldsOf(events: readonly Event[]): Map<TribeId, NonNullable<TribeHeldNote['hold']>> {
  const holds = new Map<TribeId, NonNullable<TribeHeldNote['hold']>>();
  for (const event of events) {
    if (!isEventOf(event, 'tribe.held')) continue;
    const { tribe, hold } = event.data;
    if (hold === null) holds.delete(tribe);
    else holds.set(tribe, hold);
  }
  return holds;
}
