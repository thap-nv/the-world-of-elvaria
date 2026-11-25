import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema, TribeSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, tempDir, testIo } from '../__fixtures__/cli.ts';
import { FAKE_LANTERN, LANTERN_ADAPTER, installLantern, kingdomJson } from '../__fixtures__/lantern.ts';
import { crewOf, handOf } from './crew.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

describe('file adapter SHA-256 gate (SEC-03)', () => {
  let dir: TempDir;
  let root: string;
  beforeEach(async () => {
    dir = await tempDir();
    root = await foundKingdom(dir.root);
    await installLantern(root);
  });
  afterEach(() => dir.remove());

  const place = async () => ({ kingdom: KingdomSchema.parse(await kingdomJson(root)), root });
  const tribe = (more: object = {}) =>
    TribeSchema.parse({
      id: 'lantern',
      adapter: LANTERN_ADAPTER,
      enabled: true,
      max_concurrent: 1,
      tool: { path: FAKE_LANTERN.replaceAll('\\', '/'), version: '0.4.2' },
      ...more,
    });
  const hash = async () =>
    createHash('sha256')
      .update(await readFile(path.join(root, LANTERN_ADAPTER)))
      .digest('hex');

  it('loads matching enabled and unpinned disabled adapters', async () => {
    expect((await handOf(tribe({ adapter_sha256: await hash() }), await place(), testIo())).kind).toBe(
      'ready',
    );
    expect((await handOf(tribe({ enabled: false }), await place(), testIo())).kind).toBe('ready');
  });

  it('refuses changed bytes before executing them, even when Node cached the old module', async () => {
    const adapter_sha256 = await hash();
    const pinned = tribe({ adapter_sha256 });
    expect((await handOf(pinned, await place(), testIo())).kind).toBe('ready');
    await appendFile(path.join(root, LANTERN_ADAPTER), '\nthrow new Error("must not execute");\n');
    const found = await handOf(pinned, await place(), testIo());
    expect(found.kind).toBe('broken');
    if (found.kind !== 'broken') throw new Error('expected refusal');
    expect(found.problems.join('\n')).toContain(adapter_sha256);
    expect(found.problems.join('\n')).toContain(await hash());
    expect(found.problems.join('\n')).toContain('elvaria tribe check lantern');
    const current = await place();
    const crew = await crewOf({ ...current, kingdom: { ...current.kingdom, tribes: [pinned] } }, testIo());
    expect(crew.runners).toEqual({});
    expect(crew.broken.map(({ tribe: entry }) => entry.id)).toEqual(['lantern']);
  });

  it('refuses an enabled adapter without a pin and allows an explicit recheck', async () => {
    const found = await handOf(tribe(), await place(), testIo());
    expect(found.kind).toBe('broken');
    if (found.kind !== 'broken') throw new Error('expected refusal');
    expect(found.problems.join('\n')).toContain('elvaria tribe check lantern');
    expect((await handOf(tribe(), await place(), testIo(), undefined, false)).kind).toBe('ready');
  });
});
