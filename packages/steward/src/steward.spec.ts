import { reduce } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil, worldOfFiles } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(options: Parameters<typeof bench>[0] = {}) {
  current = await bench(options);
  running = current.steward();
  const started = await running.start({ loop: false });
  expect(started).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const typesOf = async (root: string) => (await openEventLog(root).read()).events.map(({ type }) => type);

describe('the Steward, one quest', () => {
  it('takes a quest from the inbox all the way to done, each change with its line', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Add the orders API'));
    await tickUntil(steward, kingdom.clock, async () => (await kingdom.quests())[0]?.status === 'done');
    const [quest] = await kingdom.quests();
    expect(quest).toMatchObject({ status: 'done', assignee: 'kael', verifier: 'orin', attempts: 1 });
    expect(quest?.attempt_log.map(({ role, outcome }) => [role, outcome])).toEqual([
      ['assignee', 'submitted'],
      ['verifier', 'submitted'],
    ]);
    const types = await typesOf(kingdom.root);
    expect(types).toEqual([
      'quest.created',
      'command.applied',
      'quest.claimed',
      'quest.started',
      'quest.submitted',
      'quest.started',
      'verdict.pass',
      'quest.done',
      // Step 7 of the same tick (P1-14).
      'quest.delivered',
    ]);
    // The log, replayed over the morning, gives back the files (P0-09): no change went unwritten.
    const log = await openEventLog(kingdom.root).read();
    expect(reduce(await kingdom.morning(), log.events)).toEqual(await worldOfFiles(kingdom.store));
    expect(kingdom.warnings).toEqual([]);
  });

  it('writes the verdict file and enters it in the reputation and tag windows of the assignee', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Add the orders API', { tags: ['backend', 'db'] }));
    await tickUntil(steward, kingdom.clock, async () => (await kingdom.quests())[0]?.status === 'done');
    const [quest] = await kingdom.quests();
    const verdict = await kingdom.store.verdicts.read(`${quest?.id}-1` as never);
    expect(verdict).toMatchObject({
      ok: true,
      value: { result: 'pass', verifier_id: 'orin', ritual: 'build_review' },
    });
    const kael = await kingdom.character('kael');
    expect(kael.reputation.window).toHaveLength(1);
    expect(Object.keys(kael.skill_affinity).sort()).toEqual(['backend', 'db']);
    expect(kael.status).toBe('idle');
  });

  it('refuses a second Steward on the same kingdom', async () => {
    const { kingdom } = await open();
    const second = kingdom.steward();
    expect(await second.start({ loop: false })).toEqual({ ok: false, error: 'locked' });
  });
});
