// Where events live in a kingdom (implementation-plan §2.2). This package owns these names because the hook
// (P1-08) writes them and may load nothing but the event log; @elvaria/store sits above and can reuse them.
import path from 'node:path';

import { EventLogError } from './errors.ts';

/** The log: one `YYYY-MM-DD.jsonl` per local day of the kingdom. */
export const EVENTS_DIR = 'events';
/** Fake days of the sandbox, kept apart so they never look real (§7). */
export const SANDBOX_EVENTS_DIR = 'events/sandbox';
/** The machine journal of one quest, written by the hook (ADR 0010). */
export const journalOf = (quest: string): string => `quests/${quest}/journal.jsonl`;

/**
 * QUEST_ID_PATTERN of @elvaria/domain, repeated so that loading this package does not load the domain
 * (see schema.ts); layout.spec.ts keeps the two equal.
 */
export const QUEST_ID_SHAPE = /^q_[0-9]{8}_[0-9a-hjkmnp-tv-z]{6}$/;

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const TS_DAY = /^(\d{4}-\d{2}-\d{2})T/;

/**
 * The day file of an event is the date written in its own `ts`. Writers format `ts` in `kingdom.tz` (§2.1),
 * so that date is the kingdom's local day; a line and its file can never disagree, and appending needs no
 * time zone data.
 */
export const dayOfTs = (ts: string): string | undefined => TS_DAY.exec(ts)?.[1];

export const dayFileName = (day: string): string => `${day}.jsonl`;

/** The day of a file name in the log folder; undefined for anything else (`sandbox/`, temp files). */
export const dayOfFileName = (name: string): string | undefined => DAY_FILE.exec(name)?.[1];

/** Native path of the log folder of a kingdom, or of its sandbox. */
export function eventLogDir(kingdomDir: string, options: { readonly sandbox?: boolean } = {}): string {
  const relative = options.sandbox === true ? SANDBOX_EVENTS_DIR : EVENTS_DIR;
  return path.join(kingdomDir, ...relative.split('/'));
}

/** Native path of a quest's journal; the id is checked first, since it comes from the environment in a hook. */
export function journalPath(kingdomDir: string, quest: string): string {
  if (!QUEST_ID_SHAPE.test(quest)) {
    throw new EventLogError('invalid_quest_id', `"${quest}" is not a quest id`);
  }
  return path.join(kingdomDir, ...journalOf(quest).split('/'));
}
