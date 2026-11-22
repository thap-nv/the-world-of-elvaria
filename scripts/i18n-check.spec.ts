import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { GLOSSARY, LOCALE_FILES, LOCALE_NAMESPACES } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { folderProblems, run } from './i18n-check.mjs';

describe('i18n:check', () => {
  it('passes on the shipped locale files and glossary', () => {
    // Counted, not written down: every task adds strings (P0-08 added the CLI's).
    const keys = Object.keys(LOCALE_FILES.vi.messages).length;
    const spaces = Object.keys(LOCALE_NAMESPACES.vi).length;
    expect(keys).toBeGreaterThan(3);
    expect(spaces).toBeGreaterThan(3);
    expect(run()).toEqual({
      code: 0,
      text: `i18n:check: ${keys} keys in ${spaces} namespaces in vi, en; glossary.json well-formed`,
    });
  });

  it('fails on an English key Vietnamese does not have, a key in the wrong file and a malformed glossary', () => {
    const en = { ...LOCALE_FILES.en, messages: { ...LOCALE_FILES.en.messages, 'quest.extra': 'Extra' } };
    const store = { version: 1, messages: { 'quest.extra': 'Extra' } };
    const namespaces = { ...LOCALE_NAMESPACES, en: { ...LOCALE_NAMESPACES.en, store } };
    expect(
      run({ files: { ...LOCALE_FILES, en }, namespaces, glossary: { ...GLOSSARY, version: 0 } }),
    ).toEqual({
      code: 1,
      text: [
        'i18n:check: 3 problems',
        'en: "quest.extra" is not in vi',
        'en/store.json: "quest.extra" belongs in en/quest.json',
        'glossary: version 0, expected 1',
      ].join('\n'),
    });
  });
});

describe('folderProblems', () => {
  let dir = '';
  const namespaces = { vi: { cli: { version: 1, messages: {} } } };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'i18n check '));
    await mkdir(path.join(dir, 'vi'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 10 });
  });

  it('accepts a loaded namespace file up to 40 KB, and ignores what is not JSON', async () => {
    await writeFile(path.join(dir, 'vi', 'cli.json'), 'x'.repeat(40 * 1024));
    await writeFile(path.join(dir, 'vi.ts'), '');
    expect(folderProblems(namespaces, dir)).toEqual([]);
  });

  it('reports a file over 40 KB, a JSON file no namespace loads, a folder that is no locale and a whole-locale file', async () => {
    await writeFile(path.join(dir, 'vi', 'cli.json'), 'x'.repeat(40 * 1024 + 1));
    await writeFile(path.join(dir, 'vi', 'cli-quest.json'), '{}');
    await mkdir(path.join(dir, 'fr'));
    await writeFile(path.join(dir, 'vi.json'), '{}');
    expect(folderProblems(namespaces, dir)).toEqual([
      'locales/fr: not a locale (vi, en)',
      'locales/vi.json: strings go in locales/<locale>/<namespace>.json',
      'locales/vi/cli-quest.json: no namespace loads it (locales/vi.ts)',
      'locales/vi/cli.json: 40961 bytes, over 40960; split it by a longer prefix',
    ]);
  });
});
