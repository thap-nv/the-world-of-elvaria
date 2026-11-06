// What a writer can get wrong. These are bugs in the caller (a line too long, a stamp without a date), not
// states of the log, so they are thrown; a bad line found while reading is an EventLogIssue instead.

export type EventLogErrorCode =
  /** The line would pass MAX_LINE_BYTES: one write() could no longer keep it whole next to other writers. */
  | 'line_too_long'
  /** `ts` does not start with a `YYYY-MM-DD` date, so the line has no day file. */
  | 'invalid_ts'
  /** Not a quest id: a journal path is built from it, and it must not leave `quests/`. */
  | 'invalid_quest_id'
  /** redact-patterns.json holds a flag the redactor does not allow. */
  | 'invalid_pattern';

export class EventLogError extends Error {
  readonly code: EventLogErrorCode;

  constructor(code: EventLogErrorCode, message: string) {
    super(message);
    this.name = 'EventLogError';
    this.code = code;
  }
}

export const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;

export const isMissing = (error: unknown): boolean => errorCode(error) === 'ENOENT';
