// What can be wrong with a line of scripture (PS-12, lesson-sharing T4): one closed list of codes, each with its level.
// An `error` fails `elvaria scripture lint`; the first six also keep the line out of every prompt (temple-first plan
// DB3: a scope the machine cannot read must not widen to every session). A `warning` is shown and never blocks.

/** In the order the lint prints them for one line. */
export const LESSON_ISSUE_CODES = [
  // The grammar and the scope: the line never loads.
  'bad_id',
  'bad_head',
  'unknown_key',
  'unknown_value',
  'empty_text',
  'hidden_char',
  // The rules of T4 on the sentence.
  'too_long',
  'html',
  'url',
  'absolute_path',
  // A pattern of the event log's redaction matched; the caller checks it, the domain cannot import `eventlog`.
  'secret',
  'missing_fail_kind',
  // Kinds of instruction rule-file poisoning used (lesson-sharing §13): flagged for the owner's eye, never blocked.
  'install',
  'env',
  'cli_config',
  'network',
  // Of a file or a character, not of one lesson.
  'stray',
  'over_cap',
] as const;
export type LessonIssueCode = (typeof LESSON_ISSUE_CODES)[number];

export type LessonIssueLevel = 'error' | 'warning';

export const LESSON_ISSUE_LEVELS: Readonly<Record<LessonIssueCode, LessonIssueLevel>> = {
  bad_id: 'error',
  bad_head: 'error',
  unknown_key: 'error',
  unknown_value: 'error',
  empty_text: 'error',
  hidden_char: 'error',
  too_long: 'error',
  html: 'error',
  url: 'error',
  absolute_path: 'error',
  secret: 'error',
  // The owner's lines may lack one (T4 asks it of a line that travels); the Monk's never do (PS-12c refuses them).
  missing_fail_kind: 'warning',
  install: 'warning',
  env: 'warning',
  cli_config: 'warning',
  network: 'warning',
  // Text that is no lesson is never loaded; the owner may have meant a lesson.
  stray: 'warning',
  // The session loads the first 40 and leaves the rest (DB4).
  over_cap: 'warning',
};

/** The codes that keep a line out of every prompt. */
export const UNLOADABLE_CODES: readonly LessonIssueCode[] = [
  'bad_id',
  'bad_head',
  'unknown_key',
  'unknown_value',
  'empty_text',
  'hidden_char',
];

/** One thing wrong with a line; `key` and `value` name the part of the scope head at fault. */
export interface LessonFlaw {
  readonly code: LessonIssueCode;
  readonly key?: string;
  readonly value?: string;
}

export interface LessonIssue extends LessonFlaw {
  readonly level: LessonIssueLevel;
}

export const issueOf = (flaw: LessonFlaw): LessonIssue => ({
  ...flaw,
  level: LESSON_ISSUE_LEVELS[flaw.code],
});
