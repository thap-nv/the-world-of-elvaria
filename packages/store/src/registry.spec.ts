import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixture, plant, plantRegistry, tempKingdom } from '../test/kingdom.ts';
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
  it('reads the five files of registry/ as one registry', async () => {
    await plantRegistry(kingdom.root);
    const registry = await loaded();
    expect(registry.kinds.map((kind) => kind.id)).toEqual(['document']);
    expect(registry.classes.map((entry) => entry.id)).toEqual(['scribe', 'judge']);
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
    expect(!result.ok && result.error).toHaveLength(5);
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
});

describe('missingRegistryFiles', () => {
  it('names prompts and script entries the kingdom does not have', async () => {
    await plantRegistry(kingdom.root);
    const registry = await loaded();
    expect((await missingRegistryFiles(kingdom.root, registry)).map((issue) => issue.file)).toEqual([
      'registry/prompts/scribe.md',
      'registry/prompts/judge.md',
      'registry/scripts/count-files.mjs',
    ]);
    await plant(kingdom.root, 'registry/prompts/scribe.md', '# Scribe\n');
    await plant(kingdom.root, 'registry/prompts/judge.md', '# Judge\n');
    await plant(kingdom.root, 'registry/scripts/count-files.mjs', '');
    expect(await missingRegistryFiles(kingdom.root, registry)).toEqual([]);
  });
});
