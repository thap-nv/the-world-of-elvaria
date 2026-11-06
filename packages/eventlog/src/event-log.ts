// The two kinds of event file a kingdom has, as the objects other packages are handed: the log (one file per
// day, `StewardDeps.events`, implementation-plan §3.1) and a quest's journal (ADR 0010).
import { appendByDay, appendEvents } from './append.ts';
import { eventLogDir, journalPath } from './layout.ts';
import { readEventFile } from './read-file.ts';
import { endOfLog, readEventLog } from './read-log.ts';
import { tailEventLog } from './tail.ts';
import type { EventCursor } from './cursor.ts';
import type { FileBatch } from './read-file.ts';
import type { EventBatch } from './read-log.ts';
import type { TailOptions } from './tail.ts';
import type { Event } from '@elvaria/domain';

export interface EventLog {
  /** Native path of the folder of day files. */
  readonly dir: string;
  /** Each event goes to the file of the day in its `ts`, one line each. Redact before (ADR 0013). */
  append(events: readonly Event[]): Promise<void>;
  /** Every complete line after `from` (default: the whole log). */
  read(from?: EventCursor): Promise<EventBatch>;
  /** A cursor at the current end, for a tail that wants only what comes next. */
  end(): Promise<EventCursor>;
  tail(options?: TailOptions): AsyncGenerator<EventBatch, void>;
}

export interface Journal {
  /** Native path of `quests/<id>/journal.jsonl`. */
  readonly file: string;
  append(events: readonly Event[]): Promise<void>;
  /** Every complete line after byte `from` (default: the whole journal). */
  read(from?: number): Promise<FileBatch>;
}

/** The log of the kingdom at `kingdomDir`, or its sandbox (`events/sandbox/`, fake days only). */
export function openEventLog(kingdomDir: string, options: { readonly sandbox?: boolean } = {}): EventLog {
  const dir = eventLogDir(kingdomDir, options);
  return {
    dir,
    append: (events) => appendByDay(dir, events),
    read: (from) => readEventLog(dir, from),
    end: () => endOfLog(dir),
    tail: (tailOptions) => tailEventLog(dir, tailOptions),
  };
}

/** The journal of one quest; throws EventLogError `invalid_quest_id` for anything but a quest id. */
export function openJournal(kingdomDir: string, quest: string): Journal {
  const file = journalPath(kingdomDir, quest);
  return {
    file,
    append: (events) => appendEvents(file, events),
    read: (from) => readEventFile(file, from),
  };
}
