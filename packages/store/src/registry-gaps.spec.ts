import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, plant, plantRegistry, tempKingdom } from '../test/kingdom.ts';
import { loadRegistry } from './registry.ts';
import { addMissingRegistryEntries, registryGaps } from './registry-gaps.ts';
import type { TempKingdom } from '../test/kingdom.ts';

type Entries = Record<string, unknown>[];
const listOf = (contract: string, key: string): Entries =>
  (fixture(contract) as Record<string, Entries>)[key] ?? [];

/**
 * The default registry of a newer Elvaria, made of the fixtures: what P1-20 added to the real one, in small. A new
 * ritual and a new tag, and the kind it overrides gains `ritual_overrides`.
 */
function newerDefaults(): Record<string, unknown> {
  const [document] = listOf('kind', 'kinds');
  const [editorial] = listOf('ritual', 'rituals');
  const [docs] = listOf('tag', 'tags');
  return {
    kinds: [{ ...document, ritual_overrides: [{ tags_any: ['integration'], ritual: 'mutation_check' }] }],
    classes: listOf('class', 'classes'),
    rituals: [editorial, { ...editorial, id: 'mutation_check', name_en: 'Mutation check' }],
    scripts: listOf('script', 'scripts'),
    tags: [docs, { ...docs, id: 'integration', name_en: 'Integration' }],
    memos: listOf('memo-kind', 'memos'),
  };
}

async function plantDefaults(root: string, files: Record<string, unknown>): Promise<void> {
  for (const [file, list] of Object.entries(files))
    await plant(root, `${file}.json`, { version: 1, [file]: list });
}

const readJson = async (root: string, relative: string): Promise<unknown> =>
  JSON.parse(await readFile(path.join(root, ...relative.split('/')), 'utf8'));

let kingdom: TempKingdom;
let defaults: TempKingdom;
beforeEach(async () => {
  kingdom = await tempKingdom();
  defaults = await tempKingdom();
  await plantRegistry(kingdom.root);
  await plantDefaults(defaults.root, newerDefaults());
});
afterEach(async () => {
  await kingdom.remove();
  await defaults.remove();
});

describe('registryGaps (P1-41)', () => {
  it('names the entries a kingdom made before them lacks, and the keys its own entries lack', async () => {
    expect(await registryGaps(kingdom.root, defaults.root)).toEqual({
      ok: true,
      value: [
        { file: 'kinds', id: 'document', fields: ['ritual_overrides'] },
        { file: 'rituals', id: 'mutation_check' },
        { file: 'tags', id: 'integration' },
      ],
    });
  });

  it('is empty for a kingdom made from the same registry', async () => {
    await plantDefaults(kingdom.root + '/registry', newerDefaults());
    expect(await registryGaps(kingdom.root, defaults.root)).toEqual({ ok: true, value: [] });
  });

  it('reports a registry file it cannot read', async () => {
    await plant(kingdom.root, 'registry/tags.json', '{ broken');
    const gaps = await registryGaps(kingdom.root, defaults.root);
    expect(gaps.ok ? [] : gaps.error.map((issue) => [issue.code, issue.file])).toEqual([
      ['invalid_json', 'registry/tags.json'],
    ]);
  });
});

describe('addMissingRegistryEntries (P1-41)', () => {
  it('adds the missing entries whole and leaves every entry the owner has as it is', async () => {
    const owned = listOf('kind', 'kinds').map((kind) => ({ ...kind, name_en: 'My documents' }));
    await plant(kingdom.root, 'registry/kinds.json', { version: 1, kinds: owned });
    const kinds = await readFile(path.join(kingdom.root, 'registry', 'kinds.json'), 'utf8');
    const tags = await readFile(path.join(kingdom.root, 'registry', 'tags.json'), 'utf8');

    const report = await addMissingRegistryEntries(kingdom.root, defaults.root, '20261110T090000');
    expect(report).toEqual({
      ok: true,
      value: {
        added: [
          { file: 'rituals', id: 'mutation_check' },
          { file: 'tags', id: 'integration' },
        ],
        fields: [{ file: 'kinds', id: 'document', fields: ['ritual_overrides'] }],
        refused: [],
        issues: [],
        backup: '.backup/20261110T090000',
      },
    });
    expect(await readFile(path.join(kingdom.root, 'registry', 'kinds.json'), 'utf8')).toBe(kinds);
    const written = (await readJson(kingdom.root, 'registry/tags.json')) as { tags: { id: string }[] };
    expect(written.tags.map((tag) => tag.id)).toEqual(['docs', 'integration']);
    const backup = path.join(kingdom.root, '.backup', '20261110T090000', 'registry');
    expect((await readdir(backup)).sort()).toEqual(['rituals.json', 'tags.json']);
    expect(await readFile(path.join(backup, 'tags.json'), 'utf8')).toBe(tags);
    expect((await loadRegistry(kingdom.root)).ok).toBe(true);

    const again = await addMissingRegistryEntries(kingdom.root, defaults.root, '20261110T091500');
    expect(again).toEqual({
      ok: true,
      value: {
        added: [],
        fields: [{ file: 'kinds', id: 'document', fields: ['ritual_overrides'] }],
        refused: [],
        issues: [],
      },
    });
  });

  it('keeps the older text a migration of the same run already saved', async () => {
    await plant(kingdom.root, '.backup/20261110T090000/registry/tags.json', 'older\n');
    await addMissingRegistryEntries(kingdom.root, defaults.root, '20261110T090000');
    const saved = path.join(kingdom.root, '.backup', '20261110T090000', 'registry', 'tags.json');
    expect(await readFile(saved, 'utf8')).toBe('older\n');
  });

  it('adds nothing when the registry with the new entries would not load', async () => {
    // A new kind that the scribe class lists in the defaults; the owner's scribe does not, and stays the owner's.
    const files = newerDefaults();
    const [document] = listOf('kind', 'kinds');
    const memo = { ...document, id: 'memo', name_en: 'Memo' };
    const classes = listOf('class', 'classes').map((entry) =>
      entry.id === 'scribe' ? { ...entry, kinds: ['document', 'memo'] } : entry,
    );
    await plantDefaults(defaults.root, { ...files, kinds: [...(files.kinds as Entries), memo], classes });
    const tags = await readFile(path.join(kingdom.root, 'registry', 'tags.json'), 'utf8');

    const report = await addMissingRegistryEntries(kingdom.root, defaults.root, '20261110T090000');
    expect(report.ok && report.value.added).toEqual([]);
    expect(report.ok && report.value.refused).toEqual([
      { file: 'kinds', id: 'memo' },
      { file: 'rituals', id: 'mutation_check' },
      { file: 'tags', id: 'integration' },
    ]);
    expect(report.ok && report.value.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['class_kind_mismatch', ['kinds', 1, 'classes_allowed', 0]],
    ]);
    expect(report.ok && report.value.backup).toBeUndefined();
    expect(await readFile(path.join(kingdom.root, 'registry', 'tags.json'), 'utf8')).toBe(tags);
  });

  it('reports a registry file it cannot read, and refuses a backup stamp that is not a folder name', async () => {
    await plant(kingdom.root, 'registry/rituals.json', JSON.stringify({ version: 9, rituals: [] }));
    const report = await addMissingRegistryEntries(kingdom.root, defaults.root, '20261110T090000');
    expect(report.ok ? [] : report.error.map((issue) => issue.code)).toEqual(['future_version']);
    await expect(addMissingRegistryEntries(kingdom.root, defaults.root, '../out')).rejects.toThrow(
      'plain folder name',
    );
  });
});
