// The lint of scripture (PS-12, lesson-sharing T4 and S8): every line, the owner's too, against the grammar, the scope
// the kingdom knows and the rules a line must keep to travel: one sentence of at most 300 characters, only visible
// characters, no HTML, no URL, no absolute path, a fail kind. Kinds of instruction that poisoned rule files (§13) are
// flagged, not blocked. The redaction patterns are the caller's (`secret`): the domain cannot import the event log.
import { LESSON_TEXT_MAX_LENGTH } from '../schema/lesson/constants.ts';
import { LESSON_ISSUE_CODES, issueOf } from './issues.ts';
import { unknownScopeOf } from './select.ts';
import type { LessonFlaw, LessonIssue, LessonIssueCode } from './issues.ts';
import type { ParsedScripture, ScriptureLine } from './parse.ts';
import type { LessonVocabulary } from './select.ts';

// Inline code shows what it holds: `git diff <base>...HEAD` is no HTML tag.
const CODE_SPAN = /`[^`]*`/gu;
const HTML = /<!--|<\/?[a-z][a-z0-9-]*(?:\s+[a-z-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/iu;
const URL = /\b[a-z][a-z0-9+.-]*:\/\/\S|\bwww\.[a-z0-9-]+\.[a-z]/iu;
// A home folder, a drive, a UNC share, or a rooted path of two parts or more (`/etc/hosts`; a lone `/help` is not).
const ABSOLUTE_PATH = /(?:^|[\s"'`(=])(?:~[\\/]|[a-z]:[\\/]|\\\\[^\\\s]|\/[^\s/"'`]+\/)/iu;
const INSTALL =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\b|\bpip3?\s+install\b|\b(?:brew|apt|apt-get|choco|winget|scoop|cargo|go|gem)\s+install\b|\bnpx\s|\|\s*(?:ba|z)?sh\b/iu;
const ENV =
  /\$[A-Z_][A-Z0-9_]*|\$\{[A-Za-z_]|%[A-Z_][A-Z0-9_]*%|\$env:|\bprocess\.env\b|\bexport\s+[A-Za-z_]\w*=|\b(?:environment|env) var/u;
const CLI_CONFIG =
  /(?:^|[\s"'`(~/\\])\.(?:claude|codex|gemini)\b|\bsettings(?:\.local)?\.json\b|\bconfig\.toml\b|--dangerously|--yolo|\bmcp\b/iu;
const NETWORK = /\b\d{1,3}(?:\.\d{1,3}){3}\b|\blocalhost\b|\bport\s+\d{2,5}\b/iu;

interface TextRule {
  readonly code: LessonIssueCode;
  readonly pattern: RegExp;
  /** Read the sentence with its inline code taken out. */
  readonly outsideCode?: true;
}

const TEXT_RULES: readonly TextRule[] = [
  { code: 'html', pattern: HTML, outsideCode: true },
  { code: 'url', pattern: URL },
  { code: 'absolute_path', pattern: ABSOLUTE_PATH },
  { code: 'install', pattern: INSTALL },
  { code: 'env', pattern: ENV },
  { code: 'cli_config', pattern: CLI_CONFIG },
  { code: 'network', pattern: NETWORK },
];

function textFlawsOf(text: string): LessonFlaw[] {
  const bare = text.replace(CODE_SPAN, ' ');
  const rules = TEXT_RULES.filter(({ pattern, outsideCode }) =>
    pattern.test(outsideCode === true ? bare : text),
  );
  return [
    ...(text.length > LESSON_TEXT_MAX_LENGTH ? [{ code: 'too_long' as const }] : []),
    ...rules.map(({ code }) => ({ code })),
  ];
}

const rank = (code: LessonIssueCode): number => LESSON_ISSUE_CODES.indexOf(code);

/** What is wrong with one lesson, most serious kind first. */
export function lintLesson(line: ScriptureLine, vocabulary: LessonVocabulary): LessonIssue[] {
  const flaws: LessonFlaw[] = [
    ...line.flaws,
    ...unknownScopeOf(line, vocabulary),
    ...textFlawsOf(line.text),
    ...(line.fail_kind === null ? [{ code: 'missing_fail_kind' as const }] : []),
  ];
  return flaws.toSorted((a, b) => rank(a.code) - rank(b.code)).map(issueOf);
}

/** An issue at a line of a file. */
export interface ScriptureIssue extends LessonIssue {
  readonly line: number;
}

/** Every issue of a scripture file, by line: its lessons' and its stray text's. */
export function lintScripture(parsed: ParsedScripture, vocabulary: LessonVocabulary): ScriptureIssue[] {
  const lessons = parsed.lessons.flatMap((lesson) =>
    lintLesson(lesson, vocabulary).map((issue) => ({ ...issue, line: lesson.line })),
  );
  const stray = parsed.stray.map((line) => ({ ...issueOf({ code: 'stray' }), line }));
  return [...lessons, ...stray].toSorted((a, b) => a.line - b.line);
}
