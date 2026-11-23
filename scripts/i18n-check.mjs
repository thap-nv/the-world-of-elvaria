// `pnpm i18n:check` (implementation-plan §4.1, the dc1 pattern): the locale files agree with Vietnamese, the
// reference, and glossary.json keeps the shape docs:gen and docs:check rely on. Since AH-04 the strings sit in one
// file per namespace and locale; this also reads the folder, which @elvaria/i18n cannot (it runs in the browser),
// so a namespace file nobody imports, or one grown past the size that keeps it cheap to read, fails here.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import {
  DEFAULT_LOCALE,
  GLOSSARY,
  LOCALES,
  LOCALE_FILES,
  LOCALE_NAMESPACES,
  glossaryProblems,
  localeProblems,
  namespaceFile,
  namespaceProblems,
} from '@elvaria/i18n';

import { duplicateKeys } from './i18n-duplicates.mjs';

/** @typedef {import('@elvaria/i18n').Glossary} Glossary */
/** @typedef {import('@elvaria/i18n').LocaleFile} LocaleFile */
/** @typedef {import('@elvaria/i18n').Namespaces} Namespaces */

export const LOCALES_DIR = resolve(import.meta.dirname, '../packages/i18n/src/locales');
/** The size a namespace file stays under (architecture-health V4): split it by a longer prefix before it grows. */
export const NAMESPACE_FILE_LIMIT = 40 * 1024;

/**
 * Problems of the namespace files on disk: a folder that is no locale, a JSON file no namespace names, a file
 * over the limit, and a whole-locale file like the `vi.json` before AH-04, which a branch cut before the split
 * brings back when it merges.
 * @param {Readonly<Record<string, Namespaces>>} namespaces
 * @param {string} dir
 * @returns {string[]}
 */
export function folderProblems(namespaces, dir = LOCALES_DIR) {
  const problems = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    if (entry.isDirectory() && !Object.hasOwn(namespaces, entry.name))
      problems.push(`locales/${entry.name}: not a locale (${LOCALES.join(', ')})`);
    else if (entry.isFile() && entry.name.endsWith('.json'))
      problems.push(`locales/${entry.name}: strings go in locales/<locale>/<namespace>.json`);
  }
  for (const [locale, files] of Object.entries(namespaces)) {
    const named = new Set(Object.keys(files).map(namespaceFile));
    for (const name of readdirSync(join(dir, locale))
      .filter((file) => file.endsWith('.json'))
      .sort()) {
      const where = `locales/${locale}/${name}`;
      problems.push(...duplicateKeys(readFileSync(join(dir, locale, name), 'utf8'), where));
      if (!named.has(name)) problems.push(`${where}: no namespace loads it (locales/${locale}.ts)`);
      const { size } = statSync(join(dir, locale, name));
      if (size > NAMESPACE_FILE_LIMIT)
        problems.push(`${where}: ${size} bytes, over ${NAMESPACE_FILE_LIMIT}; split it by a longer prefix`);
    }
  }
  return problems;
}

/**
 * @param {{ files?: Readonly<Record<string, LocaleFile>>; namespaces?: Readonly<Record<string, Namespaces>>;
 *   glossary?: Glossary; dir?: string }} [input]
 * @returns {{ code: number; text: string }}
 */
export function run(input = {}) {
  const {
    files = LOCALE_FILES,
    namespaces = LOCALE_NAMESPACES,
    glossary = GLOSSARY,
    dir = LOCALES_DIR,
  } = input;
  const problems = [
    ...localeProblems(files, DEFAULT_LOCALE),
    ...namespaceProblems(namespaces, DEFAULT_LOCALE),
    ...folderProblems(namespaces, dir),
    ...glossaryProblems(glossary),
  ];
  if (problems.length > 0)
    return { code: 1, text: [`i18n:check: ${problems.length} problems`, ...problems].join('\n') };
  const keys = Object.keys(files[DEFAULT_LOCALE]?.messages ?? {}).length;
  const spaces = Object.keys(namespaces[DEFAULT_LOCALE] ?? {}).length;
  const locales = Object.keys(files).join(', ');
  return {
    code: 0,
    text: `i18n:check: ${keys} keys in ${spaces} namespaces in ${locales}; glossary.json well-formed`,
  };
}

if (import.meta.main) {
  const { code, text } = run();
  (code === 0 ? console.log : console.error)(text);
  process.exitCode = code;
}
