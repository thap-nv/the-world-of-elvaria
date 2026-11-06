// What a reader can find in a log file, as values: a bad line is reported and skipped, never fatal, because
// the log is append-only and one torn or unknown line must not hide the lines after it.

export type EventLogIssueCode =
  | 'invalid_json'
  /** No integer `v` ≥ 1 (ADR 0003). */
  | 'missing_version'
  /** Written by a newer Elvaria: this reader cannot read it. */
  | 'future_version'
  | 'migration_failed'
  /** The domain's EventSchema rejects the line; `details` lists where. */
  | 'invalid'
  /** A file left the cursor with bytes after its last newline: a writer died in the middle of a line. */
  | 'partial_line'
  /** The file is shorter than the cursor; it was read again from the start. */
  | 'truncated';

export interface IssueDetail {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export interface EventLogIssue {
  readonly code: EventLogIssueCode;
  /** Native path of the file. */
  readonly file: string;
  /** Byte offset of the line (or of the unread bytes) in the file. */
  readonly offset: number;
  /** English, for logs. */
  readonly message: string;
  readonly details?: readonly IssueDetail[];
}
