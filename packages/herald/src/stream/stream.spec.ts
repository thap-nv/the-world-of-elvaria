// The streams of `/ws` over real sockets on port 0, a kingdom of two territories in a folder with a space in its name,
// `ws` as the client (wave-1 plan P2-01c). Each spec awaits the message or the close it expects: the Herald reads the
// log every PULSE_MS, so a line appended is a message soon after, never a sleep here. 0 mana.
import { REDACTED, openEventLog } from '@elvaria/eventlog';
import { SECRET_SAMPLES } from '@elvaria/testkit';
import { DeviceSchema, worldStateWithManaOf } from '@elvaria/domain';
import type { Device, Event } from '@elvaria/domain';
import type { KingdomStore } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { openClient, streamOf } from '../__fixtures__/client.ts';
import { KINGDOM, cookieOf, deviceId, fullDevice, harness, postCode } from '../__fixtures__/herald.ts';
import {
  NORTH,
  Q_NORTH,
  Q_SOUTH,
  SOUTH,
  appliedLine,
  questLine,
  questOf,
  territoryOf,
  toolLine,
} from '../__fixtures__/world.ts';
import { FRAME_BYTES_MAX, STREAMS_PER_DEVICE_MAX } from '../limit/limits.ts';
import type { Client } from '../__fixtures__/client.ts';
import type { Harness } from '../__fixtures__/herald.ts';

const scoped = (suffix: string, territories: string[]): Device =>
  DeviceSchema.parse({ ...fullDevice(suffix, `Scoped ${suffix}`), role: 'scoped', territories });

async function seed(store: KingdomStore): Promise<void> {
  await store.territories.write(territoryOf(NORTH));
  await store.territories.write(territoryOf(SOUTH));
  await store.quests.write(Q_NORTH);
  await store.quests.write(Q_SOUTH);
}

let h: Harness | undefined;
const started = async (): Promise<Harness> => {
  h = await harness({}, seed);
  return h;
};
afterEach(async () => {
  await h?.stop();
  h = undefined;
});

const append = (herald: Harness, events: readonly Event[]) => openEventLog(herald.store.root).append(events);

/** The ids of the lines of events messages, up to the message that holds `last`. */
async function linesUntil(client: Client, last: Event, ids: readonly string[] = []): Promise<string[]> {
  const next = [...ids, ...(await client.next('events')).events.map(({ id }) => id)];
  return next.includes(last.id) ? next : linesUntil(client, last, next);
}

/** A session cookie of `device`, paired through the loopback origin. */
const pairedCookie = async (herald: Harness, device: Device): Promise<string> =>
  cookieOf(await postCode(herald.herald.port, await herald.code(device)));

describe('the upgrade to /ws (threat model "Trước P2-01" 1)', () => {
  it('refuses no cookie, a foreign or missing Origin, a foreign Host and another path', async () => {
    const herald = await started();
    const port = herald.herald.port;
    const paired = await pairedCookie(herald, fullDevice());
    const cases: [string, Parameters<typeof openClient>[1], number][] = [
      ['no cookie', {}, 401],
      ['foreign origin', { cookie: paired, origin: 'https://evil.example' }, 403],
      ['no origin', { cookie: paired, origin: null }, 403],
      ['foreign host', { cookie: paired, host: 'evil.example' }, 403],
      ['another path', { cookie: paired, path: '/stream' }, 404],
    ];
    for (const [name, dial, status] of cases) {
      const opened = await openClient(port, dial);
      expect({ name, status: opened.ok ? 101 : opened.status }).toEqual({ name, status });
    }
    expect((await openClient(port, { cookie: paired })).ok).toBe(true);
  });
});

describe('a stream of a full device', () => {
  it('opens with the state of the files, then the attention queue, then the new lines in order', async () => {
    const herald = await started();
    const client = await streamOf(herald, fullDevice());
    const { state } = await client.next('snapshot');
    const files = { kingdom: KINGDOM, territories: [territoryOf(NORTH), territoryOf(SOUTH)] };
    expect(state).toEqual(
      worldStateWithManaOf({ ...files, characters: [], quests: [Q_NORTH, Q_SOUTH], memos: [] }, []),
    );
    expect((await client.next('attention')).items).toBeInstanceOf(Array);

    const last = toolLine(Q_SOUTH, 'pnpm test');
    const lines = [toolLine(Q_NORTH, 'pnpm lint'), questLine(Q_SOUTH), last];
    await append(herald, lines);
    expect(await linesUntil(client, last)).toEqual(lines.map(({ id }) => id));
  });

  it('masks every secret of the event log’s samples, in the lines and in a later snapshot (measure 6)', async () => {
    const herald = await started();
    const first = await streamOf(herald, fullDevice());
    const samples = SECRET_SAMPLES.filter(({ kind }) => kind !== 'known');
    const last = toolLine(Q_NORTH, 'pnpm lint');
    const leaky = [
      questLine(Q_NORTH, samples.map(({ line }) => line).join('\n')),
      ...samples.map(({ line }) => toolLine(Q_NORTH, line)),
      last,
    ];
    await append(herald, leaky);
    await linesUntil(first, last);
    const later = await streamOf(herald, fullDevice('cccccc'));
    const { state } = await later.next('snapshot');
    expect(state.quests[Q_NORTH.id]?.question).toContain(REDACTED);
    for (const text of [...first.texts, ...later.texts])
      for (const { kind, secret } of samples)
        expect({ kind, leaked: text.includes(secret) }).toEqual({ kind, leaked: false });
  });
});

describe('a stream of a scoped device (W6)', () => {
  it('sees only its territories, in the snapshot and the lines, and the results of its own commands', async () => {
    const herald = await started();
    const north = scoped('dddddd', [NORTH]);
    const client = await streamOf(herald, north);
    const { state } = await client.next('snapshot');
    expect(Object.keys(state.quests)).toEqual([Q_NORTH.id]);
    expect(Object.keys(state.territories)).toEqual([NORTH]);

    const own = appliedLine(north.id);
    const last = toolLine(Q_NORTH, 'pnpm lint');
    const lines = [
      questLine(questOf('s0th02', SOUTH)),
      toolLine(Q_SOUTH, 'pnpm build'),
      appliedLine(deviceId('eeeeee')),
      own,
      last,
    ];
    await append(herald, lines);
    expect(await linesUntil(client, last)).toEqual([own.id, last.id]);
    expect(client.texts.some((text) => text.includes(Q_SOUTH.id) || text.includes('s0th02'))).toBe(false);
  });

  it('gets a new snapshot when the owner changes its territories, and is closed once revoked', async () => {
    const herald = await started();
    const device = scoped('ffffff', [NORTH]);
    const client = await streamOf(herald, device);
    await client.next('snapshot');
    await herald.store.devices.write(scoped('ffffff', [SOUTH]));
    expect(Object.keys((await client.next('snapshot')).state.quests)).toEqual([Q_SOUTH.id]);
    await herald.store.devices.write({ ...device, revoked_at: '2026-11-27T11:00:00+07:00' });
    expect(await client.closed).toBe(4401);
  });
});

describe('the ceilings of a stream (measure 4)', () => {
  it('closes a stream whose frame is larger than FRAME_BYTES_MAX', async () => {
    const herald = await started();
    const client = await streamOf(herald, fullDevice());
    await client.next('snapshot');
    client.send('x'.repeat(FRAME_BYTES_MAX + 1));
    // 1009 when the close frame arrives first; the client still writing its frame may see the reset first (1006,
    // ECONNRESET on Windows, as P2-01b saw with the body ceiling).
    expect([1006, 1009]).toContain(await client.closed);
  });

  it('refuses one stream more than STREAMS_PER_DEVICE_MAX for a device, and takes it once one closed', async () => {
    const herald = await started();
    const clients = [];
    for (let n = 0; n < STREAMS_PER_DEVICE_MAX; n += 1) clients.push(await streamOf(herald, fullDevice()));
    const cookie = await pairedCookie(herald, fullDevice());
    expect(await openClient(herald.herald.port, { cookie })).toEqual({ ok: false, status: 429 });
    clients[0]?.close();
    await clients[0]?.closed;
    expect((await openClient(herald.herald.port, { cookie })).ok).toBe(true);
  });
});

describe('two Heralds side by side', () => {
  it('each streams its own kingdom on its own port', async () => {
    const [one, two] = await Promise.all([
      harness({}, (store) => store.territories.write(territoryOf(NORTH)).then(() => undefined)),
      harness({}, (store) => store.territories.write(territoryOf(SOUTH)).then(() => undefined)),
    ]);
    try {
      const [a, b] = await Promise.all([streamOf(one, fullDevice()), streamOf(two, fullDevice())]);
      expect(one.herald.port).not.toBe(two.herald.port);
      expect(Object.keys((await a.next('snapshot')).state.territories)).toEqual([NORTH]);
      expect(Object.keys((await b.next('snapshot')).state.territories)).toEqual([SOUTH]);
    } finally {
      await Promise.all([one.stop(), two.stop()]);
    }
  });
});
