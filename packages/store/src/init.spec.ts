import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, fixtureText, plant, tempKingdom } from '../test/kingdom.ts';
import { initKingdom } from './init.ts';
import { openKingdom } from './kingdom-store.ts';
import { KINGDOM_DIRS } from './layout.ts';
import type { TempKingdom } from '../test/kingdom.ts';
import type { RegistrySource } from './init.ts';
import type { Kingdom } from '@elvaria/domain';

const KINGDOM = KingdomSchema.parse(fixture('kingdom'));
const REGISTRY_FILES = ['kinds.json', 'classes.json', 'rituals.json', 'scripts.json', 'tags.json'];
const CONTRACT_OF: Record<string, string> = {
  'kinds.json': 'kind',
  'classes.json': 'class',
  'rituals.json': 'ritual',
  'scripts.json': 'script',
  'tags.json': 'tag',
};

let source: TempKingdom;
let kingdom: TempKingdom;
let registry: RegistrySource;
beforeEach(async () => {
  // A registry source laid out like @elvaria/registry-default: the five files, a script, a prompt.
  source = await tempKingdom();
  for (const file of REGISTRY_FILES) {
    const contract = CONTRACT_OF[file];
    if (contract !== undefined) await plant(source.root, file, fixtureText(contract));
  }
  await plant(source.root, 'scripts/count-files.mjs', 'console.log("{}");\n');
  await plant(source.root, 'prompts/scribe.md', '# Scribe\n');
  registry = {
    root: source.root,
    files: [...REGISTRY_FILES, 'scripts/count-files.mjs', 'prompts/scribe.md'],
  };
  kingdom = await tempKingdom();
});
afterEach(async () => {
  await source.remove();
  await kingdom.remove();
});

describe('initKingdom (implementation-plan §2.2, ADR 0016)', () => {
  it('lays out the kingdom, copies the registry and writes kingdom.json', async () => {
    expect(await initKingdom(kingdom.root, KINGDOM, registry)).toEqual({ ok: true, value: KINGDOM });
    const top = await readdir(kingdom.root);
    for (const dir of KINGDOM_DIRS.filter((entry) => !entry.includes('/'))) expect(top).toContain(dir);
    expect(await readdir(path.join(kingdom.root, 'inbox'))).toEqual(['done']);
    for (const file of registry.files) {
      expect(await readFile(path.join(kingdom.root, 'registry', file), 'utf8')).toBe(
        await readFile(path.join(source.root, file), 'utf8'),
      );
    }
    const store = openKingdom(kingdom.root);
    expect(await store.kingdom.read()).toEqual({ ok: true, value: KINGDOM });
    expect((await store.loadRegistry()).ok).toBe(true);
  });

  it('never overwrites a kingdom', async () => {
    await initKingdom(kingdom.root, KINGDOM, registry);
    const renamed = { ...KINGDOM, name: 'Other' };
    expect(await initKingdom(kingdom.root, renamed, registry)).toMatchObject({
      ok: false,
      error: { code: 'exists', file: 'kingdom.json' },
    });
    expect(await openKingdom(kingdom.root).kingdom.read()).toEqual({ ok: true, value: KINGDOM });
  });

  it('runs again after an init that stopped before kingdom.json', async () => {
    await initKingdom(kingdom.root, KINGDOM, registry);
    await rm(path.join(kingdom.root, 'kingdom.json'));
    expect((await initKingdom(kingdom.root, KINGDOM, registry)).ok).toBe(true);
  });

  it('touches nothing when the kingdom is invalid or a registry file points outside', async () => {
    const invalid: Kingdom = { ...KINGDOM, tz: 'Mars/Olympus' };
    expect(await initKingdom(kingdom.root, invalid, registry)).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    const escaping = { ...registry, files: ['kinds.json', '../outside.json'] };
    expect(await initKingdom(kingdom.root, KINGDOM, escaping)).toMatchObject({
      ok: false,
      error: { code: 'invalid_id', file: 'registry/../outside.json' },
    });
    expect(await readdir(kingdom.root)).toEqual([]);
  });
});
