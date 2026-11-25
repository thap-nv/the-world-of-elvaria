// HL-03: summoning a healer (ADR 0034), in a kingdom made with it and in one made before it.
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CharacterSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

type Entry = Record<string, unknown> & { id: string };

describe('elvaria character add --class healer', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const classesFile = () => path.join(kingdom, 'registry', 'classes.json');
  const promptFile = () => path.join(kingdom, 'registry', 'prompts', 'healer.md');
  const classIds = async (): Promise<string[]> =>
    (JSON.parse(await readFile(classesFile(), 'utf8')) as { classes: Entry[] }).classes.map(({ id }) => id);
  const readCharacter = async (id: string) =>
    CharacterSchema.parse(
      JSON.parse(await readFile(path.join(kingdom, 'characters', id, 'character.json'), 'utf8')),
    );
  const add = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'character', 'add', ...args, '--kingdom', kingdom, '--locale', 'en');

  it('summons a healer that may work, and names the family of doers it mends', async () => {
    const io = testIo();
    expect(await add(io, 'salve', '--class', 'healer')).toBe(0);
    expect(await readCharacter('salve')).toMatchObject({
      class: 'healer',
      tribe: 'claude',
      model: 'claude-sonnet-5-5',
      status: 'idle',
      // A healer edits the quest's plot: it is a doer, not a judge or a monk.
      vow_no_production: false,
    });
    expect(io.printed.out[0]).toBe('Summoned «Salve» (salve): Healer, level 4.');
    expect(io.printed.out.at(-1)).toBe(
      'As a healer it mends the quests whose doers include a model of the claude family; for another family, summon a healer on a model of that one.',
    );
  });

  it("reads the family from the model, not the tribe's name (plans/healer.md 4.3)", async () => {
    const io = testIo();
    const args = ['--class', 'healer', '--tribe', 'gemini', '--model', 'gemini-3.8-flash-high'];
    expect(await add(io, 'balm', ...args)).toBe(0);
    expect(io.printed.out.at(-1)).toMatch(/model of the gemini family;/);
    const onClaude = testIo();
    const claude = ['--class', 'healer', '--tribe', 'gemini', '--model', 'claude-sonnet-5-5'];
    expect(await add(onClaude, 'poultice', ...claude)).toBe(0);
    expect(onClaude.printed.out.at(-1)).toMatch(/model of the claude family;/);
  });

  it('says nothing of a family when it summons another class', async () => {
    const io = testIo();
    expect(await add(io, 'thorn', '--class', 'knight')).toBe(0);
    expect(io.printed.out.join('\n')).not.toContain('healer');
  });

  it('loads a kingdom made before the healer, and migrate brings the class and its prompt in', async () => {
    // A classes.json and prompts/ of before HL-03: no healer row, no is_healer key, no healer.md.
    const before = JSON.parse(await readFile(classesFile(), 'utf8')) as { classes: Entry[] };
    const classes = before.classes.filter(({ id }) => id !== 'healer');
    expect(classes.some((entry) => 'is_healer' in entry)).toBe(false);
    await writeFile(classesFile(), JSON.stringify({ ...before, classes }));
    await rm(promptFile());
    expect(await add(testIo(), 'thorn', '--class', 'knight')).toBe(0);
    const refused = testIo();
    expect(await add(refused, 'salve', '--class', 'healer')).toBe(1);
    expect(refused.printed.err[0]).toMatch(
      /^--class «healer» does not exist; choose one of: chancellor, .*monk\.$/,
    );

    // `elvaria upgrade` runs the pinned build's migrate, which adds the default entries a kingdom lacks by id.
    expect(await run(testIo(), 'migrate', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect((await classIds()).at(-1)).toBe('healer');
    await expect(access(promptFile())).resolves.toBeUndefined();
    expect(await add(testIo(), 'salve', '--class', 'healer')).toBe(0);
    expect((await readCharacter('salve')).class).toBe('healer');
  });
});
