import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CharacterSchema, KingdomSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria character add', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const readCharacter = async (id: string) =>
    CharacterSchema.parse(
      JSON.parse(await readFile(path.join(kingdom, 'characters', id, 'character.json'), 'utf8')),
    );
  const add = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'character', 'add', ...args, '--kingdom', kingdom, '--locale', 'en');

  it("summons an idle character with the class's tribe and model, at the model's starting level", async () => {
    const io = testIo();
    expect(await add(io, 'thorn', '--class', 'knight')).toBe(0);
    expect(await readCharacter('thorn')).toMatchObject({
      id: 'thorn',
      name: 'Thorn',
      class: 'knight',
      tribe: 'claude',
      model: 'claude-sonnet-5-5',
      level: 4,
      status: 'idle',
      status_since: '2026-11-06T09:00:00+07:00',
      vow_no_production: false,
      reputation: { window: [] },
      skill_affinity: {},
      pinned_tag: null,
      consecutive_fail: { count: 0 },
      stats: { quests_done: 0, tokens_today: 0, tokens_day: '2026-11-06' },
    });
    expect(io.printed.out).toEqual([
      'Summoned «Thorn» (thorn): Knight, level 4.',
      'Tribe claude, model claude-sonnet-5-5.',
      'Starting level 4, from model claude-sonnet-5-5: the Steward gives it quests up to rank C.',
    ]);
  });

  it('starts at level 1 on a model it knows no level for, and says how to start higher (P1-26)', async () => {
    const io = testIo();
    expect(await add(io, 'otto', '--class', 'knight', '--model', 'gpt-oss-120b-medium')).toBe(0);
    expect((await readCharacter('otto')).level).toBe(1);
    expect(io.printed.out.at(-1)).toBe(
      'No starting level is known for model gpt-oss-120b-medium: level 1, given rank F quests only. Summon with --level 1–10, by how strong the model is, to start higher.',
    );
  });

  it('sets the starting level, tribe, model and name the owner gives (§2.6)', async () => {
    const args = [
      '--class',
      'judge',
      '--tribe',
      'gemini',
      '--model',
      'gemini-4-argon-medium',
      '--level',
      '8',
      '--name',
      'Vela',
    ];
    const io = testIo();
    expect(await add(io, 'vela', ...args)).toBe(0);
    // The owner's level needs no word on where it came from.
    expect(io.printed.out).toHaveLength(2);
    expect(await readCharacter('vela')).toMatchObject({
      tribe: 'gemini',
      model: 'gemini-4-argon-medium',
      level: 8,
      name: 'Vela',
      vow_no_production: true,
    });
  });

  it('asks for a model when the tribe has no default for the class', async () => {
    const io = testIo();
    expect(await add(io, 'vela', '--class', 'judge', '--tribe', 'gemini')).toBe(1);
    expect(io.printed.err).toEqual([
      'Tribe gemini has no default model for this class; add --model <model>.',
    ]);
  });

  it('takes the default model doctor pinned for a tribe', async () => {
    const file = path.join(kingdom, 'kingdom.json');
    const kingdomJson = KingdomSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    const tool = {
      path: 'C:/tools/agy.exe',
      version: '1.5.2',
      default_model: 'gemini-4-argon-medium',
      auth: 'login',
    };
    const tribes = kingdomJson.tribes.map((tribe) => (tribe.id === 'gemini' ? { ...tribe, tool } : tribe));
    await writeFile(file, JSON.stringify({ ...kingdomJson, tribes }));
    expect(await add(testIo(), 'vela', '--class', 'judge', '--tribe', 'gemini')).toBe(0);
    expect((await readCharacter('vela')).model).toBe('gemini-4-argon-medium');
  });

  it('notes a disabled tribe', async () => {
    const file = path.join(kingdom, 'kingdom.json');
    const kingdomJson = KingdomSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    const tribes = kingdomJson.tribes.map((tribe) => ({ ...tribe, enabled: tribe.id !== 'claude' }));
    await writeFile(file, JSON.stringify({ ...kingdomJson, tribes }));
    const io = testIo();
    expect(await add(io, 'thorn', '--class', 'knight')).toBe(0);
    expect(printed(io)).toContain('Note: tribe claude is disabled');
  });

  it('never overwrites a character', async () => {
    expect(await add(testIo(), 'thorn', '--class', 'knight', '--level', '3')).toBe(0);
    const io = testIo();
    expect(await add(io, 'thorn', '--class', 'scribe')).toBe(1);
    expect(io.printed.err).toEqual([
      'Character thorn already exists; summoning never overwrites a character.',
    ]);
    expect((await readCharacter('thorn')).level).toBe(3);
  });

  it('names every problem with the command line at once', async () => {
    const io = testIo();
    const args = ['--class', 'paladin', '--tribe', 'codex', '--level', '11', '--name', 'n'.repeat(25)];
    expect(await add(io, 'user', ...args)).toBe(1);
    expect(io.printed.err).toEqual([
      'Character id «user» is not valid: lowercase letters, digits and hyphens, up to 32 characters, not user, machine or temple.',
      'A name has 1 to 24 characters.',
      'The level must be a whole number from 1 to 10.',
      expect.stringMatching(/^--class «paladin» does not exist; choose one of: chancellor, mage, knight/),
      '--tribe «codex» does not exist; choose one of: claude, gemini.',
    ]);
  });

  it('refuses a model slug the schema would refuse', async () => {
    const io = testIo();
    expect(await add(io, 'thorn', '--class', 'knight', '--model', 'Claude Opus')).toBe(1);
    expect(io.printed.err).toEqual([
      'Model «Claude Opus» is not valid: lowercase letters, digits, dots and hyphens only.',
    ]);
  });

  it('lists characters with their class in the owner language', async () => {
    const empty = testIo();
    expect(await run(empty, 'character', 'list', '--kingdom', kingdom)).toBe(0);
    expect(empty.printed.out[0]).toContain('Chưa có nhân vật nào');
    await add(testIo(), 'thorn', '--class', 'knight', '--level', '5');
    const io = testIo();
    expect(await run(io, 'character', 'list', '--kingdom', kingdom)).toBe(0);
    expect(io.printed.out[0]).toMatch(/^ID\s+Tên\s+Nghề\s+Tộc\s+Model\s+Cấp\s+Trạng thái$/);
    expect(io.printed.out[1]).toMatch(/^thorn\s+Thorn\s+Hiệp sĩ\s+claude\s+claude-sonnet-5-5\s+5\s+Rảnh$/);
  });
});
