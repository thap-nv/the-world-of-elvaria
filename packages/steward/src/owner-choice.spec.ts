// The owner's choices of who works and at what level (P1-29): a create_quest naming its assignee, which only that
// character takes, and set_level, after which the character's claims go by the new level's ceiling.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(options: BenchOptions = {}) {
  current = await bench(options);
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** A command id after every one the bench gives, so the file is applied last. */
const LAST = '7ZZZZZZZZZZZZZZZZZZZZZZZZZ';
const TS = '2026-11-07T09:00:00+07:00';

const JUDGES = [
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
  { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
] as const;

const lines = async (kingdom: Bench) => (await openEventLog(kingdom.root).read()).events;
const answers = async (kingdom: Bench) =>
  (await lines(kingdom))
    .filter(({ type }) => type.startsWith('command.'))
    .map(({ type, data }) => [type, (data as { reason?: string }).reason]);

describe('create_quest with an assignee', () => {
  it('gives the new quest to that character only, its level aside, once it is free', async () => {
    const plays = { work: { 'Keeps kael busy': ['hang'] } } as const;
    const cast = [
      { id: 'thorn', cls: 'knight', level: 5 },
      { id: 'kael', cls: 'knight', level: 3 },
      ...JUDGES,
    ];
    const { kingdom, steward } = await open({ cast, plays });
    await kingdom.command('create_quest', questPayload('Keeps kael busy', { assignee: 'kael' }));
    await steward.tick();
    expect(await kingdom.quest('Keeps kael busy')).toMatchObject({ status: 'working', assignee: 'kael' });
    // Rank B is two above kael's ceiling (D): the Steward would never give it, the owner may, with the seal.
    await kingdom.command('create_quest', questPayload('For kael only', { rank: 'B', assignee: 'kael' }));
    await steward.tick();
    expect(await kingdom.quest('For kael only')).toMatchObject({
      status: 'claimed',
      assignee: 'kael',
      seal_required: true,
    });
    // thorn, of the same class and free, does not take it.
    expect((await kingdom.character('thorn')).status).toBe('idle');
    await kingdom.command('cancel', { quest: (await kingdom.quest('Keeps kael busy')).id });
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('For kael only')).status === 'working',
    );
    expect(await kingdom.quest('For kael only')).toMatchObject({ assignee: 'kael', attempts: 1 });
    expect((await kingdom.character('thorn')).status).toBe('idle');
  });

  it('refuses an assignee who may not take it, and creates no quest', async () => {
    const cast = [
      { id: 'kael', cls: 'knight' },
      { id: 'wren', cls: 'scribe', tribe: 'gemini' },
      { id: 'rook', cls: 'knight', status: 'suspended' },
      // A tribe kingdom.json does not enable (here: does not list).
      { id: 'vex', cls: 'knight', tribe: 'codex' },
      ...JUDGES,
    ] as const;
    const { kingdom, steward } = await open({ cast });
    for (const assignee of ['nobody', 'wren', 'rook', 'vex'])
      await kingdom.command('create_quest', questPayload(`For ${assignee}`, { assignee }));
    await steward.tick();
    expect(await answers(kingdom)).toEqual([
      ['command.rejected', 'unknown_character'],
      ['command.rejected', 'class_mismatch'],
      ['command.rejected', 'character_suspended'],
      ['command.rejected', 'tribe_disabled'],
    ]);
    expect(await kingdom.quests()).toEqual([]);
    expect((await kingdom.character('kael')).status).toBe('idle');
  });
});

describe('set_level', () => {
  it('sets the level from now, with its line, and the next claim goes by the new ceiling', async () => {
    const { kingdom, steward } = await open({ cast: [{ id: 'ember', cls: 'knight', level: 1 }, ...JUDGES] });
    await kingdom.command('create_quest', questPayload('Rank D'));
    await steward.tick();
    // Level 1 takes F, E only when nobody else can: rank D waits.
    expect(await kingdom.quest('Rank D')).toMatchObject({ status: 'open', assignee: null });
    await kingdom.command('set_level', { character: 'ember', level: 4 });
    await steward.tick();
    const ember = await kingdom.character('ember');
    expect(ember.level).toBe(4);
    expect(ember.level_since).toBeDefined();
    expect(await kingdom.quest('Rank D')).toMatchObject({ assignee: 'ember', seal_required: false });
    const told = (await lines(kingdom)).filter(({ type }) => type.startsWith('character.level'));
    expect(told.map(({ type, actor, ts }) => [type, actor, ts])).toEqual([
      ['character.level_up', { kind: 'user' }, ember.level_since],
    ]);
    expect(told[0]?.data).toMatchObject({ character: { id: 'ember', level: 4 } });
  });

  it('sets a level down, and refuses its own level, a character it does not know and a level off the table', async () => {
    const { kingdom, steward } = await open({ cast: [{ id: 'ember', cls: 'knight', level: 5 }, ...JUDGES] });
    await kingdom.command('set_level', { character: 'ember', level: 2 });
    await kingdom.command('set_level', { character: 'ember', level: 2 });
    await kingdom.command('set_level', { character: 'nobody', level: 2 });
    // The store writes no command its schema refuses: a level off the table can only be a file by hand.
    const offTable = { version: 1, id: LAST, ts: TS, kind: 'set_level', source: 'cli' };
    const file = path.join(kingdom.root, 'inbox', `${LAST}.json`);
    await writeFile(file, JSON.stringify({ ...offTable, payload: { character: 'ember', level: 11 } }));
    await steward.tick();
    expect(await answers(kingdom)).toEqual([
      ['command.applied', undefined],
      ['command.rejected', 'same_level'],
      ['command.rejected', 'unknown_character'],
      ['command.rejected', 'invalid'],
    ]);
    expect((await kingdom.character('ember')).level).toBe(2);
    const told = (await lines(kingdom)).filter(({ type }) => type.startsWith('character.level'));
    expect(told.map(({ type, actor }) => [type, actor])).toEqual([
      ['character.level_down', { kind: 'user' }],
    ]);
  });
});
