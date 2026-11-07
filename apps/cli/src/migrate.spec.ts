import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../test/cli.ts';
import { backupStamp } from './migrate.ts';
import type { TempDir } from '../test/cli.ts';

describe('backupStamp', () => {
  it('names the backup folder after the local second', () => {
    expect(backupStamp('2026-11-06T09:12:03+07:00')).toBe('20261106T091203');
  });
});

describe('elvaria migrate', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('says there is nothing to do when every file is current', async () => {
    const kingdom = await foundKingdom(dir.root);
    const io = testIo();
    expect(await run(io, 'migrate', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(io.printed.out).toEqual(['Every file is at the current version; nothing to migrate.']);
  });

  it('copies the class prompts a kingdom made before P1-15 lacks, and keeps the owner’s own', async () => {
    const kingdom = await foundKingdom(dir.root);
    const prompts = path.join(kingdom, 'registry', 'prompts');
    await rm(prompts, { recursive: true });
    await mkdir(prompts);
    await writeFile(path.join(prompts, 'judge.md'), '# My own judge\n');
    const io = testIo();
    expect(await run(io, 'migrate', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(io.printed.out[1]).toBe(
      'Copied 10 registry files this Elvaria ships and the kingdom lacked (files you have are left as they are):',
    );
    expect(io.printed.out).toContain('  registry/prompts/mage.md');
    expect(io.printed.out).not.toContain('  registry/prompts/judge.md');
    expect(await readFile(path.join(prompts, 'judge.md'), 'utf8')).toBe('# My own judge\n');
    expect(await readdir(prompts)).toHaveLength(11);
  });

  it('reports the files it cannot read, and exits 1', async () => {
    const kingdom = await foundKingdom(dir.root);
    await mkdir(path.join(kingdom, 'quests'), { recursive: true });
    await writeFile(path.join(kingdom, 'quests', 'q_20261106_7k3m2a.json'), '{ broken');
    await writeFile(path.join(kingdom, 'quests', 'q_20261106_8m4n3b.json'), JSON.stringify({ version: 9 }));
    const io = testIo();
    expect(await run(io, 'migrate', '--kingdom', kingdom, '--locale', 'en')).toBe(1);
    expect(io.printed.err).toEqual([
      'quests/q_20261106_7k3m2a.json is not valid JSON.',
      'quests/q_20261106_8m4n3b.json was written by a newer Elvaria; left as it is, not read.',
    ]);
  });
});
