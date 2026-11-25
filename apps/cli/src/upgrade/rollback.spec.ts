import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SHA_A, SHA_B, placeBuild, readPin, writePin } from '../__fixtures__/builds.ts';
import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { refreshDefaults } from './registry-defaults.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const BACKUP = '.backup/20261112T150000-registry';

describe('upgrade rollback registry files', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await placeBuild(kingdom, SHA_B, {});
    await writePin(kingdom, SHA_A, SHA_B);
  });
  afterEach(() => dir.remove());

  const plant = async (file: string, text: string) => {
    const target = path.join(kingdom, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  };
  const read = (file: string) => readFile(path.join(kingdom, file), 'utf8');
  const rollback = async () => {
    const io = testIo();
    expect(await run(io, 'upgrade', '--rollback', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(await readPin(kingdom)).toMatchObject({ current: SHA_B, previous: SHA_A });
    return io.printed.out;
  };

  it('restores and lists saved files, leaving every other registry file alone', async () => {
    await plant(`${BACKUP}/registry/prompts/mage.md`, 'old prompt\n');
    await plant(`${BACKUP}/registry/rituals.json`, 'old rituals\n');
    await plant('registry/prompts/mage.md', 'new prompt\n');
    await plant('registry/rituals.json', 'new rituals\n');
    await plant('registry/prompts/owner.md', 'owner prompt\n');
    const out = await rollback();
    expect(out.slice(0, 3)).toEqual([
      `Restored registry files from ${BACKUP}:`,
      '  registry/prompts/mage.md',
      '  registry/rituals.json',
    ]);
    expect(await read('registry/prompts/mage.md')).toBe('old prompt\n');
    expect(await read('registry/rituals.json')).toBe('old rituals\n');
    expect(await read('registry/prompts/owner.md')).toBe('owner prompt\n');
    expect(await read(`${BACKUP}/registry/prompts/mage.md`)).toBe('old prompt\n');
  });

  it('explains that only the pointer changes when this upgrade has no backup', async () => {
    await plant('registry/prompts/mage.md', 'keep this prompt\n');
    expect(await rollback()).toContain(
      `No registry backup for this upgrade at ${BACKUP}; only the build pointer is changed.`,
    );
    expect(await read('registry/prompts/mage.md')).toBe('keep this prompt\n');
  });

  it('selects the switch stamp even when older and newer backups exist', async () => {
    await plant('.backup/20261111T150000-registry/registry/prompts/mage.md', 'wrong older\n');
    await plant(`${BACKUP}/registry/prompts/mage.md`, 'correct previous\n');
    await plant('.backup/20261113T150000-registry/registry/prompts/mage.md', 'wrong newer\n');
    await plant('.backup/20261113T150000-registry/registry/prompts/owner.md', 'unrelated\n');
    await plant('registry/prompts/owner.md', 'keep owner\n');
    expect(await rollback()).toContain('  registry/prompts/mage.md');
    expect(await read('registry/prompts/mage.md')).toBe('correct previous\n');
    expect(await read('registry/prompts/owner.md')).toBe('keep owner\n');
  });

  it('backs up under the switch time even when refresh runs at a different time', async () => {
    const before = await read('registry/prompts/mage.md');
    await plant(`.builds/${SHA_B}/packages/registry-default/prompts/mage.md`, before);
    await plant(`.builds/${SHA_A}/packages/registry-default/prompts/mage.md`, 'new default\n');
    const ctx = await openKingdomContext(
      { values: { kingdom, locale: 'en' }, positionals: [] },
      { io: testIo(), locale: 'en', localeFromFlag: true, t: translator('en') },
    );
    if (ctx === undefined) throw new Error('kingdom context missing');
    await refreshDefaults(ctx, SHA_B, SHA_A, '2026-11-12T15:00:00+07:00');
    expect(await read('registry/prompts/mage.md')).toBe('new default\n');
    expect(await read(`${BACKUP}/registry/prompts/mage.md`)).toBe(before);
    expect(await rollback()).toContain('  registry/prompts/mage.md');
    expect(await read('registry/prompts/mage.md')).toBe(before);
  });
});
