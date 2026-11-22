// What `pnpm i18n:check` reports about the locale files (implementation-plan §4.1, the dc1 pattern): every
// locale has exactly the reference's keys, and each string keeps the reference's placeholders.
import { LOCALE_FILE_VERSION, namespaceFile, namespaceOf } from './locales/namespace.ts';
import type { LocaleFile, Namespaces } from './locales/namespace.ts';
import { placeholdersOf } from './messages.ts';

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

/** Problems of one locale's namespace files: version, and each key in the file of its longest namespace. */
function placementProblems(locale: string, namespaces: Namespaces): string[] {
  const names = Object.keys(namespaces);
  const problems: string[] = [];
  for (const [name, file] of Object.entries(namespaces)) {
    const where = `${locale}/${namespaceFile(name)}`;
    if (file.version !== LOCALE_FILE_VERSION) {
      problems.push(`${where}: version ${file.version}, expected ${LOCALE_FILE_VERSION}`);
    }
    for (const key of Object.keys(file.messages)) {
      const home = namespaceOf(key, names);
      if (home !== name) {
        const belongs = home === undefined ? 'no namespace' : `${locale}/${namespaceFile(home)}`;
        problems.push(`${where}: "${key}" belongs in ${belongs}`);
      }
    }
  }
  return problems;
}

/** Namespaces of one locale against the reference's: the same names, and no two sharing a file. */
function namespaceListProblems(
  locale: string,
  names: readonly string[],
  reference: readonly string[],
  refName: string,
): string[] {
  const problems = names
    .filter(
      (name, index) => names.findIndex((other) => namespaceFile(other) === namespaceFile(name)) !== index,
    )
    .map((name) => `${locale}: namespace "${name}" shares the file ${namespaceFile(name)}`);
  for (const name of reference) {
    if (!names.includes(name)) problems.push(`${locale}: no namespace "${name}" (in ${refName})`);
  }
  for (const name of names) {
    if (!reference.includes(name)) problems.push(`${locale}: namespace "${name}" is not in ${refName}`);
  }
  return problems;
}

/**
 * Every problem of the namespace files (AH-04): `localeProblems` checks the merged keys, this checks where they
 * live, so a string for `cli.quest.…` is always in `cli-quest.json` of both locales.
 */
export function namespaceProblems(
  locales: Readonly<Record<string, Namespaces>>,
  reference: string,
): string[] {
  const base = locales[reference];
  if (base === undefined) return [`no ${reference} namespaces`];
  return Object.entries(locales).flatMap(([locale, namespaces]) => [
    ...namespaceListProblems(locale, Object.keys(namespaces), Object.keys(base), reference),
    ...placementProblems(locale, namespaces),
  ]);
}
