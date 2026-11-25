import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GLOSSARY, LOCALE_FILES, LOCALE_NAMESPACES } from '@elvaria/i18n';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
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
  let temp: TempDir;
  const namespaces = { vi: { cli: { version: 1, messages: {} } } };

  beforeEach(async () => {
    temp = await tempDir('i18n check');
    dir = temp.root;
    await mkdir(path.join(dir, 'vi'));
  });
  afterEach(async () => {
    await temp.remove();
  });

  it('accepts a loaded namespace file up to 40 KB, and ignores what is not JSON', async () => {
    await writeFile(path.join(dir, 'vi', 'cli.json'), 'x'.repeat(40 * 1024));
    await writeFile(path.join(dir, 'vi.ts'), '');
    expect(folderProblems(namespaces, dir)).toEqual([]);
  });

  it('reports repeated root and nested keys with the file and repeated occurrence line', async () => {
    await writeFile(
      path.join(dir, 'vi', 'cli.json'),
      '{\n  "version": 1,\n  "version": 1,\n  "messages": {\n    "hello": "one",\n    "hello": "two"\n  }\n}',
    );
    expect(run({ namespaces, dir })).toEqual({
      code: 1,
      text: [
        'i18n:check: 2 problems',
        'locales/vi/cli.json:3: duplicate key "version"',
        'locales/vi/cli.json:6: duplicate key "hello"',
      ].join('\n'),
    });
  });

  it('keeps separate object scopes and handles quotes, colons and escaped key spellings', async () => {
    await writeFile(
      path.join(dir, 'vi', 'cli.json'),
      String.raw`{
  "left": {"same": "text with \"key\": and braces {}"},
  "right": {"same": "ok"},
  "array": [{"same": 1}, {"same": 2}],
  "a\"b:c": "first",
  "a\u0022b:c": "second"
}`,
    );
    expect(folderProblems(namespaces, dir)).toEqual(['locales/vi/cli.json:6: duplicate key "a\\"b:c"']);
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
