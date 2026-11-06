import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema } from '@elvaria/domain';
import { registryFiles } from '@elvaria/registry-default';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TZ, foundKingdom, printed, run, tempDir, testIo } from '../test/cli.ts';
import { DEFAULT_TRIBES, newKingdom } from './init.ts';
import type { TempDir } from '../test/cli.ts';

const readKingdom = async (kingdom: string) =>
  KingdomSchema.parse(JSON.parse(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')));

describe('newKingdom', () => {
  it('fills every setting the owner did not choose with its schema default', () => {
    const kingdom = newKingdom({
      name: 'Bình Minh',
      profession: 'developer',
      locale: 'vi',
      tz: TZ,
      treasury: 'C:/Users/owner/.elvaria/treasury.json',
      createdAt: '2026-11-06T09:00:00+07:00',
    });
    expect(kingdom.mana.cap_pct).toBe(98);
    expect(kingdom.breakers.attempt_minutes).toEqual({ low: 45, high: 120 });
    expect(kingdom.theme).toBe('fantasy');
    expect(kingdom.tribes).toEqual(DEFAULT_TRIBES);
  });
});

describe('elvaria init', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('lays out a kingdom with the default registry and the two tribes of ADR 0018, 0021', async () => {
    const io = testIo();
    const kingdom = await foundKingdom(dir.root, io);
    const saved = await readKingdom(kingdom);
    expect(saved).toMatchObject({
      name: 'Bình Minh',
      tz: TZ,
      owner: { profession: 'developer', locale: 'vi' },
    });
    expect(saved.created_at).toBe('2026-11-06T09:00:00+07:00');
    expect(saved.tribes.map((tribe) => [tribe.id, tribe.adapter, tribe.max_concurrent])).toEqual([
      ['claude', 'claude_code', 2],
      ['gemini', 'antigravity', 1],
    ]);
    expect(saved.tribes[1]?.pools).toEqual({
      gemini_models: { enabled: true },
      claude_gpt_models: { enabled: false },
    });
    expect(saved.paths.treasury).toMatch(/\/\.elvaria\/treasury\.json$/);
    const copied = await readdir(path.join(kingdom, 'registry'), { recursive: true });
    for (const file of registryFiles())
      expect(copied.map((name) => name.replaceAll('\\', '/'))).toContain(file);
    expect(printed(io)).toContain(`Đã lập vương quốc «Bình Minh» tại ${kingdom}.`);
  });

  it('records the language and choices given, and the machine zone by default', async () => {
    const io = testIo({ timeZone: 'Europe/Paris' });
    const treasury = path.join(dir.root, 'vault.json');
    const kingdom = path.join(dir.root, 'k');
    const code = await run(
      io,
      'init',
      '--kingdom',
      kingdom,
      '--name',
      'Dawn',
      '--locale',
      'en',
      '--profession',
      'ba',
      '--treasury',
      treasury,
    );
    expect(code).toBe(0);
    const saved = await readKingdom(kingdom);
    expect(saved.owner).toEqual({ profession: 'ba', locale: 'en' });
    expect(saved.tz).toBe('Europe/Paris');
    expect(saved.paths.treasury).toBe(treasury.replaceAll('\\', '/'));
    expect(printed(io)).toContain('Founded the kingdom «Dawn»');
  });

  it('takes the folder from ELVARIA_KINGDOM, relative to where it runs', async () => {
    const io = testIo({ cwd: dir.root, env: { ELVARIA_KINGDOM: 'from-env' } });
    expect(await run(io, 'init', '--name', 'Env')).toBe(0);
    expect((await readKingdom(path.join(dir.root, 'from-env'))).name).toBe('Env');
  });

  it('refuses a folder that already holds a kingdom', async () => {
    const kingdom = await foundKingdom(dir.root);
    const io = testIo();
    expect(await run(io, 'init', '--kingdom', kingdom, '--name', 'Again', '--locale', 'en')).toBe(1);
    expect(io.printed.err).toEqual(['kingdom.json exists: this folder is already a kingdom.']);
  });

  it('names every bad choice at once', async () => {
    const io = testIo();
    const args = [
      '--name',
      'x'.repeat(25),
      '--profession',
      'wizard',
      '--tz',
      'Mars/Olympus',
      '--locale',
      'en',
    ];
    expect(await run(io, 'init', '--kingdom', dir.root, ...args)).toBe(2);
    expect(io.printed.err).toEqual([
      'A name has 1 to 24 characters.',
      '--profession takes one of: developer, ba, marketing, researcher, other.',
      'Time zone «Mars/Olympus» is not in the IANA time zone list.',
    ]);
  });

  it('needs a folder', async () => {
    const io = testIo({ env: {} });
    expect(await run(io, 'init', '--name', 'x', '--locale', 'en')).toBe(2);
    expect(io.printed.err).toEqual(['No kingdom given: add --kingdom <dir> or set ELVARIA_KINGDOM.']);
  });
});
