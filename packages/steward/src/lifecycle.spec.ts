import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const waitFor = async (check: () => Promise<boolean>, ms: number): Promise<boolean> => {
  for (const until = Date.now() + ms; Date.now() < until;) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};

describe('starting and stopping the Steward', () => {
  it('ticks on its own every dispatch.tick_seconds until stopped', async () => {
    current = await bench();
    const kingdom = await current.store.kingdom.read();
    if (!kingdom.ok) throw new Error('fixture');
    await current.store.kingdom.write({
      ...kingdom.value,
      dispatch: { ...kingdom.value.dispatch, tick_seconds: 1 },
    });
    running = current.steward();
    await running.start();
    await current.command('create_quest', questPayload('Picked up by the loop'));
    const quests = current;
    expect(await waitFor(async () => (await quests.quests()).length === 1, 5000)).toBe(true);
    await running.stop();
    running = undefined;
  });

  it('refuses to tick before it starts, and to start without a kingdom', async () => {
    current = await bench();
    running = current.steward();
    await expect(running.tick()).rejects.toThrow('start()');
    await rm(path.join(current.root, 'kingdom.json'));
    expect(await running.start({ loop: false })).toEqual({ ok: false, error: 'no_kingdom' });
    running = undefined;
  });

  it('decides nothing while the registry cannot be read, and says why', async () => {
    current = await bench();
    running = current.steward();
    await running.start({ loop: false });
    await writeFile(path.join(current.root, 'registry', 'kinds.json'), '{"version":1,"kinds":[{}]}');
    await current.command('create_quest', questPayload('Waits for the registry'));
    expect(await running.tick()).toEqual({
      commands: { applied: 0, rejected: 0, waiting: 0 },
      sessions: { started: 0, ended: 0 },
    });
    expect(current.warnings.join('\n')).toContain('cannot load the registry');
  });

  it('goes on when the bell fails', async () => {
    current = await bench({ cast: [{ id: 'thorn', cls: 'knight', level: 1 }] });
    running = current.steward({ bell: { ring: () => Promise.reject(new Error('no notifier')) } });
    await running.start({ loop: false });
    await current.command('create_quest', questPayload('Too high', { rank: 'B' }));
    await running.tick();
    expect(current.warnings.join('\n')).toContain('the bell failed: no notifier');
  });
});
