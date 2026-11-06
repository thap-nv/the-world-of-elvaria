// What can go wrong with a kingdom file, as values (the store's callers decide; the CLI translates `code`
// through i18n). Only expected states are issues; an IO failure nobody can act on (disk full, EACCES on the
// kingdom itself) is thrown.

export type StoreIssueCode =
  /** The file does not exist. */
  | 'not_found'
  /** An id or file name that would address something outside its folder, or not match its pattern. */
  | 'invalid_id'
  | 'invalid_json'
  /** No integer `version` ≥ 1 at the top level (ADR 0003). */
  | 'missing_version'
  /** Written by a newer Elvaria: read nothing, overwrite nothing. */
  | 'future_version'
  | 'migration_failed'
  /** The schema rejects the content; `details` lists where. */
  | 'invalid'
  /** The id inside differs from the one in the file name. */
  | 'id_mismatch'
  /** Another process held the file's lock for longer than the wait. */
  | 'locked'
  /** `initKingdom` on a folder that already has a kingdom.json. */
  | 'exists';

export interface IssueDetail {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export interface StoreIssue {
  readonly code: StoreIssueCode;
  /** Kingdom-relative path with `/`, e.g. `quests/q_20261106_7k3m2a.json`. */
  readonly file: string;
  /** English, for logs. */
  readonly message: string;
  readonly details?: readonly IssueDetail[];
}

export const storeIssue = (
  code: StoreIssueCode,
  file: string,
  message: string,
  details?: readonly IssueDetail[],
): StoreIssue => (details === undefined ? { code, file, message } : { code, file, message, details });

export const lockedIssue = (file: string): StoreIssue =>
  storeIssue('locked', file, 'another process held its lock past the wait');
