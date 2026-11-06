// Loading this entry must not load @elvaria/domain or zod: the hook imports it on every call (schema.ts).
// Domain imports in this package are `import type`, except the reader's one deferred import.
export { appendEvents, serializeEvent } from './append.ts';
export { MAX_LINE_BYTES, TAIL_INTERVAL_MS, WATCHED_DAY_FILES } from './constants.ts';
export { isEventCursor } from './cursor.ts';
export type { EventCursor } from './cursor.ts';
export { EventLogError } from './errors.ts';
export type { EventLogErrorCode } from './errors.ts';
export { openEventLog, openJournal } from './event-log.ts';
export type { EventLog, Journal } from './event-log.ts';
export type { EventLogIssue, EventLogIssueCode, IssueDetail } from './issues.ts';
export {
  EVENTS_DIR,
  QUEST_ID_SHAPE,
  SANDBOX_EVENTS_DIR,
  dayOfTs,
  eventLogDir,
  journalOf,
  journalPath,
} from './layout.ts';
export { CURRENT_EVENT_VERSION } from './migrations/index.ts';
export { readEventFile } from './read-file.ts';
export type { FileBatch } from './read-file.ts';
export type { EventBatch } from './read-log.ts';
export { REDACTED, REDACT_PATTERNS, createRedactor, redact, redactDeep } from './redact.ts';
export type { Redactor } from './redact.ts';
export { ULID_MAX_TIME_MS, createStamper, localTs, tsFormatter, ulidOf } from './stamp.ts';
export type { Stamp, StamperOptions } from './stamp.ts';
export type { TailOptions } from './tail.ts';
