// The lint of the kingdom's scriptures (PS-12, lesson-sharing T4 and S8), for `elvaria scripture lint` and the doctor:
// every line of every scripture file by the domain's rules, the redaction patterns of the event log on each sentence
// (through the Steward's lessonsIn), and each character whose heaviest session would load more than 40 lessons. (PS-12g,
// item (r) of the PS-12c row) Then the lines the owner deleted that the ledger still keeps: a fact, neither an error nor a
// warning, so the exit code and the doctor's level stay as they were.
import {
  EMPTY_LEDGER,
  SCRIPTURE_LINES_MAX,
  deletedByOwnerOf,
  lintScripture,
  parseScripture,
} from '@elvaria/domain';
import type { LessonIssue, LessonIssueCode, ScriptureIssue } from '@elvaria/domain';
import { lessonsIn } from '@elvaria/steward';
import type { MessageKey, Translate } from '@elvaria/i18n';

import { overCapOf } from './read.ts';
import type { KingdomScriptures } from './read.ts';

export interface FileIssue extends ScriptureIssue {
  readonly file: string;
}

export interface ScriptureReport {
  readonly files: number;
  readonly lessons: number;
  readonly issues: readonly FileIssue[];
  /** One line per character over the cap, already in the owner's language. */
  readonly overCap: readonly string[];
  /** One line per ledger entry whose line the owner deleted, already in the owner's language. */
  readonly deleted: readonly string[];
  readonly errors: number;
  readonly warnings: number;
}

const ISSUE_MESSAGES: Readonly<Record<LessonIssueCode, MessageKey>> = {
  bad_id: 'cli.scripture.issue.bad_id',
  bad_head: 'cli.scripture.issue.bad_head',
  unknown_key: 'cli.scripture.issue.unknown_key',
  unknown_value: 'cli.scripture.issue.unknown_value',
  empty_text: 'cli.scripture.issue.empty_text',
  hidden_char: 'cli.scripture.issue.hidden_char',
  too_long: 'cli.scripture.issue.too_long',
  html: 'cli.scripture.issue.html',
  url: 'cli.scripture.issue.url',
  absolute_path: 'cli.scripture.issue.absolute_path',
  secret: 'cli.scripture.issue.secret',
  missing_fail_kind: 'cli.scripture.issue.missing_fail_kind',
  install: 'cli.scripture.issue.install',
  env: 'cli.scripture.issue.env',
  cli_config: 'cli.scripture.issue.cli_config',
  network: 'cli.scripture.issue.network',
  stray: 'cli.scripture.issue.stray',
  over_cap: 'cli.scripture.issue.over_cap',
};

const LEVEL_LABELS: Readonly<Record<LessonIssue['level'], MessageKey>> = {
  error: 'cli.scripture.level.error',
  warning: 'cli.scripture.level.warning',
};

/** `<file>:<line>: <level>: <what is wrong>`. */
export const issueLine = (t: Translate, issue: FileIssue): string =>
  t('cli.scripture.issue_line', {
    file: issue.file,
    line: issue.line,
    level: t(LEVEL_LABELS[issue.level]),
    message: t(ISSUE_MESSAGES[issue.code], { key: issue.key ?? '', value: issue.value ?? '' }),
  });

function fileIssuesOf(scriptures: KingdomScriptures): { lessons: number; issues: FileIssue[] } {
  let lessons = 0;
  const issues = scriptures.files.flatMap((scripture) => {
    // lessonsIn flags a sentence the event log would mask (`secret`, ADR 0013), as the Steward does before a session.
    const parsed = {
      lessons: lessonsIn([scripture]),
      stray: parseScripture(scripture.text, scripture.owner).stray,
    };
    lessons += parsed.lessons.length;
    return lintScripture(parsed, scriptures.vocabulary).map((issue) => ({ ...issue, file: scripture.file }));
  });
  return { lessons, issues };
}

/** The entries of each file's ledger that no line carries any more and that were not retired (deletedByOwnerOf). */
const deletedOf = (t: Translate, scriptures: KingdomScriptures): string[] =>
  scriptures.files.flatMap(({ file, owner, text }) =>
    deletedByOwnerOf({ owner, text, ledger: scriptures.ledgers.get(owner) ?? EMPTY_LEDGER }).map((entry) =>
      t('cli.scripture.deleted', { file, lesson: entry.id, added_at: entry.added_at }),
    ),
  );

export function scriptureReportOf(t: Translate, scriptures: KingdomScriptures): ScriptureReport {
  const { lessons, issues } = fileIssuesOf(scriptures);
  const overCap = overCapOf(scriptures).map(({ character, load }) =>
    t(ISSUE_MESSAGES.over_cap, {
      character: character.id,
      lines: load.lines,
      max: SCRIPTURE_LINES_MAX,
      role: load.role,
      territory: load.territory,
    }),
  );
  const errors = issues.filter(({ level }) => level === 'error').length;
  const warnings = issues.length - errors + overCap.length;
  const deleted = deletedOf(t, scriptures);
  return { files: scriptures.files.length, lessons, issues, overCap, deleted, errors, warnings };
}
