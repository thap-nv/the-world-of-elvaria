// What `pnpm i18n:check` reports about the locale files (implementation-plan §4.1, the dc1 pattern): every
// locale has exactly the reference's keys, and each string keeps the reference's placeholders.
import { placeholdersOf } from './messages.ts';
import type { LocaleFile } from './messages.ts';

const LOCALE_FILE_VERSION = 1;
/** Dotted snake_case segments, at least two: a namespace, then the message (`sandbox.fake_data`). */
const KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

const listed = (names: readonly string[]) =>
  names.length === 0 ? 'none' : names.map((name) => `{${name}}`).join(' ');

/** Problems of one file on its own: version, key shape, empty strings. */
function fileProblems(locale: string, file: LocaleFile): string[] {
  const problems: string[] = [];
  if (file.version !== LOCALE_FILE_VERSION) {
    problems.push(`${locale}: version ${file.version}, expected ${LOCALE_FILE_VERSION}`);
  }
  for (const [key, text] of Object.entries(file.messages)) {
    if (!KEY_PATTERN.test(key)) problems.push(`${locale}: key "${key}" is not dotted snake_case`);
    if (text.trim() === '') problems.push(`${locale}: "${key}" is empty`);
  }
  return problems;
}

/** Problems of one locale measured against the reference: missing, extra, different placeholders. */
function againstReference(
  locale: string,
  file: LocaleFile,
  reference: LocaleFile,
  refName: string,
): string[] {
  const problems: string[] = [];
  for (const [key, text] of Object.entries(reference.messages)) {
    const translated = file.messages[key];
    if (translated === undefined) {
      problems.push(`${locale}: missing "${key}" (in ${refName})`);
      continue;
    }
    const expected = placeholdersOf(text);
    const actual = placeholdersOf(translated);
    if (!sameList(expected, actual)) {
      problems.push(
        `${locale}: "${key}" has placeholders ${listed(actual)}, ${refName} has ${listed(expected)}`,
      );
    }
  }
  for (const key of Object.keys(file.messages)) {
    if (!Object.hasOwn(reference.messages, key)) problems.push(`${locale}: "${key}" is not in ${refName}`);
  }
  return problems;
}

/** Every problem across the locale files; empty when they agree. `reference` names the source locale. */
export function localeProblems(files: Readonly<Record<string, LocaleFile>>, reference: string): string[] {
  const base = files[reference];
  if (base === undefined) return [`no ${reference} locale file`];
  return Object.entries(files).flatMap(([locale, file]) => [
    ...fileProblems(locale, file),
    ...(locale === reference ? [] : againstReference(locale, file, base, reference)),
  ]);
}
