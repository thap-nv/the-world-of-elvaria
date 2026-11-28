// Commands over a real stream (wave-1 plan P2-01c; ADR 0031 item 5, ADR 0037; threat model "Trước P2-01" 2 and 4):
// what lands in inbox/ is the envelope the Herald sealed, and every refusal is an answer with its code and no file.
import { DeviceSchema } from '@elvaria/domain';
import type { Device } from '@elvaria/domain';
import type { KingdomStore } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { openClient, streamOf } from '../__fixtures__/client.ts';
import { cookieOf, fullDevice, harness, postCode } from '../__fixtures__/herald.ts';
import { NORTH, Q_NORTH, Q_SOUTH, SOUTH, questOf, territoryOf } from '../__fixtures__/world.ts';
import { COMMANDS_PER_WINDOW_MAX, COMMAND_WINDOW_MS } from '../limit/limits.ts';
import type { Client } from '../__fixtures__/client.ts';
import type { Harness } from '../__fixtures__/herald.ts';

const TUNNEL = 'https://elvaria.example.ts.net';

const limited = (suffix: string, role: 'scoped' | 'inquiry', territories: string[]): Device =>
  DeviceSchema.parse({ ...fullDevice(suffix, `${role} ${suffix}`), role, territories });

async function seed(store: KingdomStore): Promise<void> {
  await store.territories.write(territoryOf(NORTH));
  await store.territories.write(territoryOf(SOUTH));
  await store.quests.write(Q_NORTH);
  await store.quests.write(Q_SOUTH);
}

let h: Harness | undefined;
afterEach(async () => {
  await h?.stop();
  h = undefined;
});
const started = async (): Promise<Harness> => {
  h = await harness({}, seed);
  return h;
};

let refs = 0;
/** Sends a command frame and awaits the Herald's answer to it. */
async function command(client: Client, kind: string, payload: object, extra: object = {}) {
  refs += 1;
  const ref = `r${refs}`;
  client.send(JSON.stringify({ type: 'command', ref, kind, payload, ...extra }));
  const answer = await client.next('accepted', 'refused');
  expect(answer.ref).toBe(ref);
  return answer.type === 'accepted' ? 'accepted' : answer.reason;
}

const inbox = async (herald: Harness) =>
  (await herald.store.inbox.read()).flatMap(({ command: read }) => (read.ok ? [read.value] : []));

describe('a command from a stream', () => {
  it('lands in inbox/ in the envelope the Herald sealed: its id, time, source and device (measure 2)', async () => {
    const herald = await started();
    const device = fullDevice();
    const client = await streamOf(herald, device);
    expect(await command(client, 'wake', { tribe: 'claude' })).toBe('accepted');
    const [written] = await inbox(herald);
    expect(written).toMatchObject({
      kind: 'wake',
      payload: { tribe: 'claude' },
      source: 'herald',
      device: device.id,
    });
    expect(herald.logged).toContainEqual({
      kind: 'command',
      device: device.id,
      command: 'wake',
      answer: 'accepted',
    });
  });

  it('refuses a frame that names its own source, id or device, and writes nothing', async () => {
    const herald = await started();
    const client = await streamOf(herald, fullDevice());
    for (const extra of [
      { source: 'cli' },
      { id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB' },
      { device: 'dev_20261127_zzzzzz' },
    ])
      expect(await command(client, 'wake', { tribe: 'claude' }, extra)).toBe('invalid_message');
    expect(await command(client, 'wake', { tribe: 'claude', source: 'cli' })).toBe('invalid_message');
    expect(await command(client, 'no_such_kind', {})).toBe('invalid_message');
    expect(await inbox(herald)).toEqual([]);
  });

  it('closes a stream that sends a frame with no ref to answer, or a binary one', async () => {
    const herald = await started();
    const text = await streamOf(herald, fullDevice());
    text.send('not json');
    expect(await text.closed).toBe(1008);
    const binary = await streamOf(herald, fullDevice());
    binary.send(Buffer.from([1, 2, 3]) as unknown as string);
    expect(await binary.closed).toBe(1008);
  });

  it('asks for the passkey for group 2 through the tunnel, never on loopback (W8)', async () => {
    const herald = await started();
    const device = fullDevice();
    const cookie = cookieOf(await postCode(herald.herald.port, await herald.code(device)));
    const opened = await openClient(herald.herald.port, {
      cookie,
      origin: TUNNEL,
      host: new URL(TUNNEL).host,
    });
    if (!opened.ok) throw new Error(`refused: ${opened.status}`);
    expect(await command(opened.client, 'seal', { quest: Q_NORTH.id })).toBe('passkey_required');
    expect(await command(opened.client, 'hold', { quest: Q_NORTH.id })).toBe('accepted');
    const loopback = await streamOf(herald, device);
    expect(await command(loopback, 'seal', { quest: Q_NORTH.id })).toBe('accepted');
    expect((await inbox(herald)).map(({ kind, source }) => [kind, source])).toEqual([
      ['hold', 'lite'],
      ['seal', 'herald'],
    ]);
  });

  it('holds a limited device to its territories and its role (ADR 0037)', async () => {
    const herald = await started();
    const scoped = await streamOf(herald, limited('aaaaab', 'scoped', [NORTH]));
    expect(await command(scoped, 'hold', { quest: Q_NORTH.id })).toBe('accepted');
    expect(await command(scoped, 'hold', { quest: Q_SOUTH.id })).toBe('outside_territories');
    expect(await command(scoped, 'hold', { quest: questOf('n0wh3r', NORTH).id })).toBe('outside_territories');
    expect(await command(scoped, 'wake', { tribe: 'claude' })).toBe('outside_territories');
    const inquiry = await streamOf(herald, limited('aaaaac', 'inquiry', [NORTH]));
    expect(await command(inquiry, 'hold', { quest: Q_NORTH.id })).toBe('role_forbids');
    expect((await inbox(herald)).length).toBe(1);
  });

  it(`refuses a device's command past ${COMMANDS_PER_WINDOW_MAX} a minute, every stream of it together`, async () => {
    const herald = await started();
    const device = fullDevice();
    const [one, two] = [await streamOf(herald, device), await streamOf(herald, device)];
    for (let n = 0; n < COMMANDS_PER_WINDOW_MAX; n += 1)
      expect(await command(n % 2 === 0 ? one : two, 'wake', { tribe: 'claude' })).toBe('accepted');
    expect(await command(two, 'wake', { tribe: 'claude' })).toBe('too_many_commands');
    herald.clock.advance(COMMAND_WINDOW_MS);
    expect(await command(one, 'wake', { tribe: 'claude' })).toBe('accepted');
    expect((await inbox(herald)).length).toBe(COMMANDS_PER_WINDOW_MAX + 1);
  });
});
