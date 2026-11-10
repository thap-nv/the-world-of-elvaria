import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RM_TEMP, foundKingdom, printed, run, tempDir, testIo } from '../test/cli.ts';
import { backupStamp } from './migrate.ts';
import type { TempDir } from '../test/cli.ts';

type Entry = Record<string, unknown> & { id: string };

const registryOf = async (kingdom: string, file: string): Promise<Entry[]> =>
  (
    JSON.parse(await readFile(path.join(kingdom, 'registry', `${file}.json`), 'utf8')) as Record<
      string,
      Entry[]
    >
  )[file] ?? [];

/** Rewrites one registry file of the kingdom by hand, as an owner (or an older Elvaria) would have it. */
async function editRegistry(
  kingdom: string,
  file: string,
  change: (entries: Entry[]) => Entry[],
): Promise<void> {
  const entries = change(await registryOf(kingdom, file));
  await writeFile(
    path.join(kingdom, 'registry', `${file}.json`),
    JSON.stringify({ version: 1, [file]: entries }),
  );
}

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
    await rm(prompts, RM_TEMP);
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

  it('adds the registry entries a kingdom made before P1-20 lacks, and changes no entry the owner has (P1-41)', async () => {
    const kingdom = await foundKingdom(dir.root);
    // The registry as P1-35 found it on the owner's kingdom: no mutation_check, no integration tag, no overrides.
    await editRegistry(kingdom, 'rituals', (rituals) =>
      rituals.filter((ritual) => ritual.id !== 'mutation_check'),
    );
    await editRegistry(kingdom, 'tags', (tags) =>
      tags
        .filter((tag) => tag.id !== 'integration')
        .map((tag) => (tag.id === 'e2e' ? { ...tag, name_en: 'Browser tests' } : tag)),
    );
    await editRegistry(kingdom, 'kinds', (kinds) => kinds.map(({ ritual_overrides: _, ...kind }) => kind));
    const kinds = await readFile(path.join(kingdom, 'registry', 'kinds.json'), 'utf8');

    const doctor = testIo({ env: { PATH: '' } });
    await run(doctor, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    expect(printed(doctor)).toContain(
      [
        '! The registry lacks 4 entries or fields this Elvaria ships (they came after the kingdom was made):',
        '    registry/kinds.json, entry build: field ritual_overrides',
        '    registry/kinds.json, entry refactor: field ritual_overrides',
        '    registry/rituals.json: entry mutation_check',
        '    registry/tags.json: entry integration',
        '    elvaria migrate adds the missing entries whole',
      ].join('\n'),
    );

    const io = testIo();
    expect(await run(io, 'migrate', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(io.printed.out).toEqual([
      'Every file is at the current version; nothing to migrate.',
      'Added 2 registry entries this Elvaria ships and the kingdom lacked (entries you have are left as they are); the old files are in .backup/20261106T090000:',
      '  registry/rituals.json: entry mutation_check',
      '  registry/tags.json: entry integration',
      expect.stringMatching(
        /^Entries you have lack 2 fields this Elvaria ships; migrate never changes an entry you have\. Copy a field from .+ if you want it:$/,
      ),
      '  registry/kinds.json, entry build: field ritual_overrides',
      '  registry/kinds.json, entry refactor: field ritual_overrides',
    ]);
    expect(await readFile(path.join(kingdom, 'registry', 'kinds.json'), 'utf8')).toBe(kinds);
    const tags = await registryOf(kingdom, 'tags');
    expect(tags.find((tag) => tag.id === 'e2e')?.name_en).toBe('Browser tests');
    expect(tags.at(-1)?.id).toBe('integration');
    expect((await registryOf(kingdom, 'rituals')).at(-1)?.id).toBe('mutation_check');
    expect(await readdir(path.join(kingdom, '.backup', '20261106T090000', 'registry'))).toEqual([
      'rituals.json',
      'tags.json',
    ]);
  });

  it('adds no entry when the registry with them would not load, and says which (P1-41)', async () => {
    const kingdom = await foundKingdom(dir.root);
    // The owner dropped the integrate kind and took it off its classes; the default kind names knight and dwarf.
    await editRegistry(kingdom, 'kinds', (kinds) => kinds.filter((kind) => kind.id !== 'integrate'));
    await editRegistry(kingdom, 'classes', (classes) =>
      classes.map((entry) => ({
        ...entry,
        kinds: (entry.kinds as string[]).filter((kind) => kind !== 'integrate'),
      })),
    );
    const io = testIo();
    expect(await run(io, 'migrate', '--kingdom', kingdom, '--locale', 'en')).toBe(1);
    expect(io.printed.err[0]).toMatch(
      /^Did not add the 1 registry entries this Elvaria ships and the kingdom lacks: with them the registry would not load\./,
    );
    expect(io.printed.err[1]).toBe('  registry/kinds.json: entry integrate');
    expect(io.printed.err.join('\n')).toContain('registry/kinds.json kinds.10.classes_allowed.0');
    expect((await registryOf(kingdom, 'kinds')).map((kind) => kind.id)).not.toContain('integrate');
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
