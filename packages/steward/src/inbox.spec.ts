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

const answers = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events
    .filter(({ type }) => type.startsWith('command.'))
    .map(({ type, data }) => [type, (data as { reason?: string }).reason]);

const inboxLeft = async (kingdom: Bench) => (await kingdom.store.inbox.read()).map(({ name }) => name);

describe('the inbox', () => {
  it('refuses what it cannot apply, with a reason, and moves every file out of the inbox', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('wake', { tribe: 'claude' });
    await kingdom.command('confirm', { quest: 'q_20261107_zzzzzz' });
    await kingdom.command('create_quest', questPayload('Somewhere else', { territory: 'atlas' }));
    await writeFile(path.join(kingdom.root, 'inbox', '01JCFB7Q2R8S4T6V9W3X5Y1Z0A.json'), '{ torn');
    await steward.tick();
    expect(await answers(kingdom)).toEqual([
      ['command.rejected', 'invalid_json'],
      ['command.rejected', 'unsupported'],
      ['command.rejected', 'unknown_quest'],
      ['command.rejected', 'unknown_territory'],
    ]);
    expect(await inboxLeft(kingdom)).toEqual([]);
    expect(kingdom.warnings).toHaveLength(1);
  });

  it('applies a command once: one the log already answered is only moved, a quest is never made twice', async () => {
    const { kingdom, steward } = await open();
    const payload = questPayload('Add the orders API');
    const id = await kingdom.command('create_quest', payload);
    await steward.tick();
    // The same command back in the inbox, as after a Steward that stopped between the line and the move.
    await kingdom.command('create_quest', payload, id);
    await steward.tick();
    expect(await kingdom.quests()).toHaveLength(1);
    expect(await answers(kingdom)).toEqual([['command.applied', undefined]]);
    // A new Steward reads the log: the command is answered already.
    await steward.stop();
    await kingdom.command('create_quest', payload, id);
    running = kingdom.steward();
    await running.start({ loop: false });
    await running.tick();
    expect(await kingdom.quests()).toHaveLength(1);
    expect(await inboxLeft(kingdom)).toEqual([]);
  });

  it('edits a quest the owner read last, never one that moved since, and sets its rank', async () => {
    const { kingdom, steward } = await open({ cast: [] });
    await kingdom.command('create_quest', questPayload('Add the orders API'));
    await steward.tick();
    const quest = await kingdom.quest('Add the orders API');
    await kingdom.command('edit_quest', {
      quest: quest.id,
      expected_updated_at: quest.updated_at,
      changes: { title: 'Orders API v2' },
    });
    await kingdom.command('edit_quest', {
      quest: quest.id,
      expected_updated_at: '2026-11-01T08:00:00+07:00',
      changes: { rank: 'S' },
    });
    await kingdom.command('set_rank', { quest: quest.id, rank: 'B' });
    await steward.tick();
    expect(await kingdom.quest('Orders API v2')).toMatchObject({ rank: 'B' });
    expect(await answers(kingdom)).toEqual([
      ['command.applied', undefined],
      ['command.applied', undefined],
      ['command.rejected', 'stale'],
      ['command.applied', undefined],
    ]);
    const types = (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);
    expect(types.filter((type) => type === 'quest.edited')).toHaveLength(2);
  });

  it('confirms a draft, discards one, and cancels a working quest, killing its session', async () => {
    const { kingdom, steward } = await open({ plays: { work: { 'Never ends': ['hang'] } } });
    await kingdom.command(
      'create_quest',
      questPayload('A draft to confirm', { draft: true, created_by: 'chancellor' }),
    );
    await kingdom.command(
      'create_quest',
      questPayload('A draft to drop', { draft: true, created_by: 'chancellor' }),
    );
    await kingdom.command('create_quest', questPayload('Never ends'));
    await steward.tick();
    const [keep, drop, hung] = await Promise.all(
      ['A draft to confirm', 'A draft to drop', 'Never ends'].map((title) => kingdom.quest(title)),
    );
    expect([keep?.status, drop?.status, hung?.status]).toEqual(['draft', 'draft', 'working']);
    await kingdom.command('confirm', { quest: keep!.id });
    await kingdom.command('archive', { quest: drop!.id });
    await kingdom.command('cancel', { quest: hung!.id });
    await steward.tick();
    expect((await kingdom.quest('A draft to drop')).status).toBe('archived');
    expect((await kingdom.quest('Never ends')).attempt_log[0]).toMatchObject({ outcome: 'cancelled' });
    // kael let go of the cancelled quest; thorn, idle the longest, took the confirmed one in the same tick.
    expect(steward.running()).toBe(1);
    expect((await kingdom.character('kael')).status).toBe('idle');
    expect((await kingdom.character('thorn')).status).toBe('working');
  });

  it("gives a quest to the owner's character above its ceiling, with the seal, once its dependency is done", async () => {
    const { kingdom, steward } = await open();
    await kingdom.command(
      'create_quest',
      questPayload('First the schema', { draft: true, created_by: 'chancellor' }),
    );
    await steward.tick();
    const schema = await kingdom.quest('First the schema');
    await kingdom.command(
      'create_quest',
      questPayload('Then the API', { rank: 'B', depends_on: [schema.id] }),
    );
    await kingdom.command('create_quest', questPayload('Wrong hands', { rank: 'E' }));
    await steward.tick();
    const api = await kingdom.quest('Then the API');
    const wrong = await kingdom.quest('Wrong hands');
    // kael is level 3 (ceiling D): the Steward would never give it rank B, the owner may.
    await kingdom.command('reassign', { quest: api.id, character: 'kael' });
    await kingdom.command('reassign', { quest: wrong.id, character: 'wren' });
    await kingdom.command('reassign', { quest: wrong.id, character: 'nobody' });
    await steward.tick();
    expect(await kingdom.quest('Then the API')).toMatchObject({
      status: 'claimed',
      assignee: 'kael',
      seal_required: true,
    });
    expect((await answers(kingdom)).slice(-2)).toEqual([
      ['command.rejected', 'class_mismatch'],
      ['command.rejected', 'unknown_character'],
    ]);
    await kingdom.command('confirm', { quest: schema.id });
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Then the API')).status === 'working',
    );
    expect((await kingdom.quest('First the schema')).status).toBe('done');
  });
});
