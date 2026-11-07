import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, characterOf, questPayload } from './__fixtures__/kingdom.ts';
import { UNCLAIMABLE_FILE, readUnclaimable } from './unclaimable.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

const JUDGES = [
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
  { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
] as const;

async function open() {
  current = await bench({ cast: [{ id: 'thorn', cls: 'knight', level: 5 }, ...JUDGES] });
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

const notices = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events
    .filter(({ type }) => type === 'quest.unclaimable' || type === 'quest.claimed')
    .map(({ type, data }) => (type === 'quest.claimed' ? 'claimed' : data));

describe('a quest nobody can take', () => {
  it('is told once, rings once, and is kept in .state/unclaimable.json', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Rework the sign-in flow', { rank: 'A' }));
    for (let tick = 0; tick < 3; tick += 1) await steward.tick();
    const quest = await kingdom.quest('Rework the sign-in flow');
    const note = {
      reason: 'level_too_low',
      rank: 'A',
      class: 'knight',
      best_character: 'thorn',
      best_level: 5,
    };
    expect(await notices(kingdom)).toEqual([note]);
    expect(kingdom.notices).toEqual([
      {
        kind: 'unclaimable',
        quest: { id: quest.id, title: 'Rework the sign-in flow', rank: 'A' },
        reason: 'level_too_low',
        class: 'knight',
        best: { character: 'thorn', level: 5, ceiling: 'C' },
      },
    ]);
    expect(await readUnclaimable(kingdom.root)).toEqual(new Map([[quest.id, note]]));
    expect(quest.status).toBe('open');
  });

  it('is withdrawn with reason null when a knight of level 8 is summoned, then claimed', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Rework the sign-in flow', { rank: 'A' }));
    await steward.tick();
    await kingdom.store.characters.write(characterOf({ id: 'brann', cls: 'knight', level: 8 }));
    await steward.tick();
    const [told, withdrawn, claimed] = await notices(kingdom);
    expect([told, withdrawn, claimed]).toEqual([
      expect.objectContaining({ reason: 'level_too_low' }),
      { reason: null, rank: 'A', class: 'knight' },
      'claimed',
    ]);
    expect((await kingdom.quest('Rework the sign-in flow')).assignee).toBe('brann');
    expect(await readUnclaimable(kingdom.root)).toEqual(new Map());
  });

  it('names a class nobody has, and changes its notice when the owner lowers the rank', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command(
      'create_quest',
      questPayload('Write the FAQ', { kind: 'document', class_required: 'scribe', territory: 'handbook' }),
    );
    await kingdom.command('create_quest', questPayload('Rework the sign-in flow', { rank: 'S' }));
    await steward.tick();
    const rework = await kingdom.quest('Rework the sign-in flow');
    await kingdom.command('set_rank', { quest: rework.id, rank: 'A' });
    await steward.tick();
    await kingdom.command('set_rank', { quest: rework.id, rank: 'B' });
    await steward.tick();
    const told = (await notices(kingdom)).filter((data) => data !== 'claimed');
    // Highest rank first, as planTick orders open quests.
    expect(told).toEqual([
      expect.objectContaining({ reason: 'level_too_low', rank: 'S' }),
      { reason: 'no_class', rank: 'D', class: 'scribe' },
      expect.objectContaining({ reason: 'level_too_low', rank: 'A' }),
      { reason: null, rank: 'B', class: 'knight' },
    ]);
    // Rank B is one above thorn's ceiling: taken because nobody else can, waiting for the seal.
    expect(await kingdom.quest('Rework the sign-in flow')).toMatchObject({
      assignee: 'thorn',
      seal_required: true,
    });
  });

  it('is not told again by a new Steward, which rebuilds its notices from the log', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Rework the sign-in flow', { rank: 'A' }));
    await steward.tick();
    await steward.stop();
    await writeFile(path.join(kingdom.root, UNCLAIMABLE_FILE), '{ torn');
    expect(await readUnclaimable(kingdom.root)).toEqual(new Map());
    running = kingdom.steward();
    await running.start({ loop: false });
    await running.tick();
    expect(await notices(kingdom)).toHaveLength(1);
    expect((await readUnclaimable(kingdom.root)).size).toBe(1);
  });
});
