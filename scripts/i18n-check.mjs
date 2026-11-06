// `pnpm i18n:check` (implementation-plan §4.1, the dc1 pattern): the locale files agree with Vietnamese, the
// reference, and glossary.json keeps the shape docs:gen and docs:check rely on.
import process from 'node:process';

import { DEFAULT_LOCALE, GLOSSARY, LOCALE_FILES, glossaryProblems, localeProblems } from '@elvaria/i18n';

/** @typedef {import('@elvaria/i18n').Glossary} Glossary */
/** @typedef {import('@elvaria/i18n').LocaleFile} LocaleFile */

/**
 * @param {Readonly<Record<string, LocaleFile>>} files
 * @param {Glossary} glossary
 * @returns {{ code: number; text: string }}
 */
export function run(files = LOCALE_FILES, glossary = GLOSSARY) {
  const problems = [...localeProblems(files, DEFAULT_LOCALE), ...glossaryProblems(glossary)];
  if (problems.length > 0)
    return { code: 1, text: [`i18n:check: ${problems.length} problems`, ...problems].join('\n') };
  const keys = Object.keys(files[DEFAULT_LOCALE]?.messages ?? {}).length;
  const locales = Object.keys(files).join(', ');
  return { code: 0, text: `i18n:check: ${keys} keys in ${locales}; glossary.json well-formed` };
}

if (import.meta.main) {
  const { code, text } = run();
  (code === 0 ? console.log : console.error)(text);
  process.exitCode = code;
}
