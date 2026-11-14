// Registry defaults a new build changed (fix/kingdom-upkeep): what the kingdom still holds as the previous build's
// default takes the new one, with a backup; what the owner edited is only named; nothing the registry cannot load.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, plant, plantRegistry, tempKingdom } from '../test/kingdom.ts';
import { loadRegistry } from './registry.ts';
import { refreshRegistryDefaults } from './registry-refresh.ts';
import type { TempKingdom } from '../test/kingdom.ts';

type Entry = Record<string, unknown>;
const listOf = (contract: string, key: string): Entry[] =>
  (fixture(contract) as Record<string, Entry[]>)[key] ?? [];

const DATA = {
  kinds: 'kind',
  classes: 'class',
  rituals: 'ritual',
  scripts: 'script',
  tags: 'tag',
  memos: 'memo-kind',
};
const PROMPTS = ['prompts/scribe.md', 'prompts/judge.md'];
const FILES = [...Object.keys(DATA).map((file) => `${file}.json`), ...PROMPTS];

/** A build's default registry: the fixtures, with `lists` over them and the prompts given. */
async function plantDefaults(root: string, lists: Record<string, Entry[]>, prompts: Record<string, string>) {
  for (const [file, contract] of Object.entries(DATA))
    await plant(root, `${file}.json`, { version: 1, [file]: lists[file] ?? listOf(contract, file) });
  for (const [file, text] of Object.entries(prompts)) await plant(root, file, text);
}

const [editorial = {}] = listOf('ritual', 'rituals');
const [documentKind = {}] = listOf('kind', 'kinds');
const NEWER_RITUAL = { ...editorial, max_seconds: 2400 };

const read = (root: string, relative: string): Promise<string> =>
  readFile(path.join(root, ...relative.split('/')), 'utf8');

let kingdom: TempKingdom;
let previous: TempKingdom;
let next: TempKingdom;
beforeEach(async () => {
  kingdom = await tempKingdom();
  previous = await tempKingdom();
  next = await tempKingdom();
  await plantRegistry(kingdom.root);
  await plantDefaults(
    previous.root,
    {},
    { 'prompts/scribe.md': '# Craft\n', 'prompts/judge.md': '# Craft\n' },
  );
  await plantDefaults(
    next.root,
    { rituals: [NEWER_RITUAL] },
    { 'prompts/scribe.md': '# Craft, sharper\n', 'prompts/judge.md': '# Judge, sharper\n' },
  );
});
afterEach(async () => {
  await Promise.all([kingdom.remove(), previous.remove(), next.remove()]);
});

const refresh = (files = FILES) =>
  refreshRegistryDefaults(
    kingdom.root,
    { previous: previous.root, next: { root: next.root, files } },
    '20261114T090000-registry',
  );

describe('refreshRegistryDefaults', () => {
  it('brings files and entries still at the previous default to the new one, the old text in the backup', async () => {
    const report = await refresh();
    expect(report).toEqual({
      updated: [
        { file: 'prompts/scribe.md' },
        { file: 'prompts/judge.md' },
        { file: 'rituals.json', id: 'editorial_review' },
      ],
      edited: [],
      refused: [],
      invalid: [],
      unchecked: [],
      issues: [],
      backup: '.backup/20261114T090000-registry',
    });
    expect(await read(kingdom.root, 'registry/prompts/scribe.md')).toBe('# Craft, sharper\n');
    expect(await read(kingdom.root, '.backup/20261114T090000-registry/registry/prompts/scribe.md')).toBe(
      '# Craft\n',
    );
    const rituals = JSON.parse(await read(kingdom.root, 'registry/rituals.json')) as { rituals: Entry[] };
    expect(rituals.rituals).toEqual([NEWER_RITUAL]);
    expect(await readdir(path.join(kingdom.root, '.backup', '20261114T090000-registry', 'registry'))).toEqual(
      ['prompts', 'rituals.json'],
    );
    expect((await loadRegistry(kingdom.root)).ok).toBe(true);
    expect(await refresh()).toMatchObject({ updated: [], edited: [] });
  });

  it('names what the owner edited and writes none of it; a default that did not change says nothing', async () => {
    await plant(kingdom.root, 'registry/prompts/judge.md', '# My own judge\n');
    const mine = { ...editorial, name_en: 'My review' };
    await plant(kingdom.root, 'registry/rituals.json', { version: 1, rituals: [mine] });
    await plant(kingdom.root, 'registry/prompts/scribe.md', '# My scribe\n');
    await plant(next.root, 'prompts/scribe.md', '# Craft\n');
    const report = await refresh();
    expect(report.updated).toEqual([]);
    expect(report.edited).toEqual([
      { file: 'prompts/judge.md' },
      { file: 'rituals.json', id: 'editorial_review' },
    ]);
    expect(report.backup).toBeUndefined();
    expect(await read(kingdom.root, 'registry/prompts/judge.md')).toBe('# My own judge\n');
    expect(await read(kingdom.root, 'registry/prompts/scribe.md')).toBe('# My scribe\n');
  });

  it('reads a kingdom file with CRLF line ends, or keys in another order, as the default it was copied from', async () => {
    await plant(kingdom.root, 'registry/prompts/scribe.md', '# Craft\r\n');
    const reordered = Object.fromEntries(Object.entries(editorial).reverse());
    await plant(kingdom.root, 'registry/rituals.json', { version: 1, rituals: [reordered] });
    const report = await refresh(['rituals.json', 'prompts/scribe.md']);
    expect(report.updated).toEqual([
      { file: 'prompts/scribe.md' },
      { file: 'rituals.json', id: 'editorial_review' },
    ]);
  });

  it('names every file the kingdom has that differs, when the previous build has no default to compare', async () => {
    await previous.remove();
    const report = await refresh();
    expect(report.updated).toEqual([]);
    expect(report.edited).toEqual([
      { file: 'prompts/scribe.md' },
      { file: 'prompts/judge.md' },
      { file: 'rituals.json', id: 'editorial_review' },
    ]);
  });

  it('leaves a file the kingdom lacks to migrate', async () => {
    await plant(next.root, 'prompts/knight.md', '# Knight\n');
    const report = await refresh([...FILES, 'prompts/knight.md']);
    expect(report.updated.map(({ file }) => file)).not.toContain('prompts/knight.md');
    await expect(read(kingdom.root, 'registry/prompts/knight.md')).rejects.toThrow();
  });

  it('refuses every entry when with them the registry would not load, and writes none', async () => {
    const broken = { ...documentKind, ritual: 'no_such_ritual' };
    await plant(next.root, 'kinds.json', { version: 1, kinds: [broken] });
    const report = await refresh(['kinds.json', 'rituals.json']);
    expect(report.updated).toEqual([]);
    expect(report.refused).toEqual([
      { file: 'kinds.json', id: 'document' },
      { file: 'rituals.json', id: 'editorial_review' },
    ]);
    expect(report.invalid.length).toBeGreaterThan(0);
    expect(JSON.parse(await read(kingdom.root, 'registry/kinds.json'))).toEqual(fixture('kind'));
  });

  it('compares no entry of a data file that does not read, or of a default newer than this Elvaria', async () => {
    await plant(kingdom.root, 'registry/tags.json', '{ broken');
    await plant(next.root, 'memos.json', { version: 99, memos: [] });
    const report = await refresh();
    // The files that did not read, then rituals.json: its new entry cannot be checked against a registry that does not.
    expect(report.unchecked).toEqual(['tags.json', 'memos.json', 'rituals.json']);
    expect(report.issues.map(({ code }) => code)).toEqual(['invalid_json', 'future_version']);
    expect(report.updated.map(({ file }) => file)).toEqual(['prompts/scribe.md', 'prompts/judge.md']);
    expect(JSON.parse(await read(kingdom.root, 'registry/rituals.json'))).toEqual(fixture('ritual'));
  });

  it('refuses a backup stamp that is not a plain folder name', async () => {
    await expect(
      refreshRegistryDefaults(
        kingdom.root,
        { previous: previous.root, next: { root: next.root, files: [] } },
        '../x',
      ),
    ).rejects.toThrow('plain folder name');
  });
});
