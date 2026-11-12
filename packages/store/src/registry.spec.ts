import { rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FIXTURE_PROMPTS, fixture, plant, plantRegistry, tempKingdom } from '../test/kingdom.ts';
import { loadRegistry, missingRegistryFiles } from './registry.ts';
import type { TempKingdom } from '../test/kingdom.ts';
import type { Registry } from '@elvaria/domain';

let kingdom: TempKingdom;
beforeEach(async () => {
  kingdom = await tempKingdom();
});
afterEach(() => kingdom.remove());

async function loaded(): Promise<Registry> {
  const result = await loadRegistry(kingdom.root);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('loadRegistry (ADR 0016)', () => {
  it('reads the six files of registry/ as one registry', async () => {
    await plantRegistry(kingdom.root);
    const registry = await loaded();
    expect(registry.kinds.map((kind) => kind.id)).toEqual(['document']);
    expect(registry.classes.map((entry) => entry.id)).toEqual(['scribe', 'judge']);
    expect(registry.memos.map((entry) => entry.route)).toEqual(['chancellor']);
  });

  it('reports every file it cannot read before running the cross-file rules', async () => {
    await plantRegistry(kingdom.root);
    await plant(kingdom.root, 'registry/tags.json', '{');
    await plant(kingdom.root, 'registry/kinds.json', { version: 2, kinds: [] });
    const result = await loadRegistry(kingdom.root);
    expect(!result.ok && result.error.map((issue) => [issue.code, issue.file])).toEqual([
      ['future_version', 'registry/kinds.json'],
      ['invalid_json', 'registry/tags.json'],
    ]);
  });

  it('reports a missing file', async () => {
    const result = await loadRegistry(kingdom.root);
    expect(!result.ok && result.error).toHaveLength(6);
    expect(!result.ok && result.error[0]).toMatchObject({ code: 'not_found', file: 'registry/kinds.json' });
  });

  it('passes on what the domain finds wrong across files', async () => {
    await plantRegistry(kingdom.root);
    const kinds = fixture('kind') as { kinds: { ritual: string }[] };
    await plant(kingdom.root, 'registry/kinds.json', {
      ...kinds,
      kinds: [{ ...kinds.kinds[0], ritual: 'nope' }],
    });
    const result = await loadRegistry(kingdom.root);
    expect(!result.ok && result.error).toEqual([
      expect.objectContaining({ file: 'kinds', code: 'unknown_ritual' }),
    ]);
  });

  it('does not load when a class has no prompt file (P1-15)', async () => {
    await plantRegistry(kingdom.root);
    await rm(path.join(kingdom.root, ...FIXTURE_PROMPTS[1].split('/')));
    const result = await loadRegistry(kingdom.root);
    expect(!result.ok && result.error).toEqual([
      {
        code: 'not_found',
        file: 'registry/prompts/judge.md',
        message: 'prompt of class judge is missing',
      },
    ]);
  });
});

describe('missingRegistryFiles', () => {
  it('names the script entries the kingdom does not have', async () => {
    await plantRegistry(kingdom.root);
    const registry = await loaded();
    expect((await missingRegistryFiles(kingdom.root, registry)).map((issue) => issue.file)).toEqual([
      'registry/scripts/count-files.mjs',
    ]);
    await plant(kingdom.root, 'registry/scripts/count-files.mjs', '');
    expect(await missingRegistryFiles(kingdom.root, registry)).toEqual([]);
  });
});
