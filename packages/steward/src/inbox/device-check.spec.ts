// The Steward checks a command of source herald or lite again against its device's role (P2-01, ADR 0037): what a
// device may not send is refused with the device's code and names the device on the line; what it may is applied.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { DeviceSchema } from '@elvaria/domain';
import type { InboxCommandInput } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload } from '../__fixtures__/kingdom.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const CODE = 'dc1-se-team';
const DOCS = 'handbook';

const DEVICES = {
  full: { id: 'dev_20261126_7pzkfv', role: 'full' },
  docs: { id: 'dev_20261126_4k2pqz', role: 'scoped', territories: [DOCS] },
  code: { id: 'dev_20261126_5m8q2r', role: 'scoped', territories: [CODE] },
  asks: { id: 'dev_20261126_9tw3hx', role: 'inquiry', territories: [CODE] },
  gone: { id: 'dev_20261126_a1b2c3', role: 'full', revoked_at: '2026-11-07T08:00:00+07:00' },
} as const;
type Name = keyof typeof DEVICES;

async function open() {
  current = await bench();
  for (const [label, device] of Object.entries(DEVICES)) {
    const written = await current.store.devices.write(
      DeviceSchema.parse({ version: 1, label, created_at: '2026-11-07T08:00:00+07:00', ...device }),
    );
    if (!written.ok) throw new Error(written.error.message);
  }
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

/** A command as the Herald writes it: `device` is a name of DEVICES, an id no file has, or none. */
async function fromDevice(
  kingdom: Bench,
  source: 'herald' | 'lite',
  device: Name | 'dev_20261126_zzzzzz' | 'dev_20261126_bbbbbb' | undefined,
  kind: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const id = kingdom.ids.ulid();
  const named =
    device === undefined ? {} : { device: device in DEVICES ? DEVICES[device as Name].id : device };
  const command = { version: 1, id, ts: '2026-11-07T09:00:00+07:00', kind, source, ...named, payload };
  const written = await kingdom.store.inbox.write(command as unknown as InboxCommandInput);
  if (!written.ok) throw new Error(written.error.message);
  return id;
}

const answerOf = async (kingdom: Bench, id: string) => {
  const line = (await openEventLog(kingdom.root).read()).events.find(
    ({ type, data }) => type.startsWith('command.') && data.command_id === id,
  );
  return [line?.type, line?.data.reason, line?.data.device];
};

describe('a command from a paired device (P2-01)', () => {
  it("refuses what the device's role does not allow, naming the device on the line", async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Built'));
    await steward.tick();
    const quest = (await kingdom.quest('Built')).id;
    const ids = [
      await fromDevice(kingdom, 'herald', 'docs', 'seal', { quest }),
      await fromDevice(kingdom, 'herald', 'asks', 'seal', { quest }),
      await fromDevice(kingdom, 'herald', 'asks', 'create_quest', questPayload('Asked to build')),
      await fromDevice(kingdom, 'herald', 'code', 'attach_territory', { path: 'D:/Work/another' }),
      await fromDevice(kingdom, 'herald', 'code', 'wake', { tribe: 'claude' }),
      await fromDevice(kingdom, 'lite', 'full', 'seal', { quest }),
      await fromDevice(kingdom, 'herald', 'gone', 'retry', { quest }),
    ];
    await steward.tick();
    expect(await Promise.all(ids.map((id) => answerOf(kingdom, id)))).toEqual([
      ['command.rejected', 'outside_territories', DEVICES.docs.id],
      ['command.rejected', 'role_forbids', DEVICES.asks.id],
      ['command.rejected', 'role_forbids', DEVICES.asks.id],
      ['command.rejected', 'role_forbids', DEVICES.code.id],
      ['command.rejected', 'outside_territories', DEVICES.code.id],
      ['command.rejected', 'passkey_required', DEVICES.full.id],
      ['command.rejected', 'device_revoked', DEVICES.gone.id],
    ]);
    expect((await kingdom.quests()).map(({ title }) => title)).toEqual(['Built']);
  });

  it('refuses a command of a device source that names no device, or one no good file holds', async () => {
    const { kingdom, steward } = await open();
    await mkdir(path.join(kingdom.root, 'devices'), { recursive: true });
    await writeFile(path.join(kingdom.root, 'devices', 'dev_20261126_bbbbbb.json'), '{ broken');
    const ids = [
      await fromDevice(kingdom, 'herald', undefined, 'create_quest', questPayload('Nameless')),
      await fromDevice(kingdom, 'lite', 'dev_20261126_zzzzzz', 'create_quest', questPayload('Stranger')),
      await fromDevice(kingdom, 'herald', 'dev_20261126_bbbbbb', 'create_quest', questPayload('Broken')),
    ];
    await steward.tick();
    expect(await Promise.all(ids.map((id) => answerOf(kingdom, id)))).toEqual([
      ['command.rejected', 'unknown_device', undefined],
      ['command.rejected', 'unknown_device', 'dev_20261126_zzzzzz'],
      ['command.rejected', 'unknown_device', 'dev_20261126_bbbbbb'],
    ]);
    expect(await kingdom.quests()).toEqual([]);
    expect(kingdom.warnings.filter((warning) => warning.includes('devices/'))).toEqual([
      expect.stringContaining('devices/dev_20261126_bbbbbb.json: invalid_json'),
    ]);
  });

  it('places a memo by the quest its file names, and a memo it cannot read nowhere', async () => {
    const { kingdom, steward } = await open();
    const id = await fromDevice(kingdom, 'herald', 'code', 'decide_memo', {
      memo: 'm_20261107_aaaaaa',
      decision: 'shelved',
    });
    await steward.tick();
    expect(await answerOf(kingdom, id)).toEqual(['command.rejected', 'outside_territories', DEVICES.code.id]);
  });

  it('applies what the role allows on its territories, and names the device on the line', async () => {
    const { kingdom, steward } = await open();
    // A quest of `elvaria quest add` skips the seal (group 2); from the phone, that needs the passkey.
    const report = questPayload('Asked', {
      kind: 'research',
      class_required: 'scout',
      tags: [],
      seal_required: true,
    });
    const ids = [
      await fromDevice(kingdom, 'herald', 'code', 'create_quest', questPayload('Scoped work')),
      await fromDevice(kingdom, 'lite', 'asks', 'create_quest', report),
      await fromDevice(kingdom, 'lite', 'asks', 'create_quest', {
        ...report,
        title: 'Unsealed',
        seal_required: false,
      }),
      await fromDevice(
        kingdom,
        'herald',
        'full',
        'create_quest',
        questPayload('Docs', { territory: DOCS, kind: 'document', class_required: 'scribe', tags: [] }),
      ),
    ];
    await steward.tick();
    expect(await Promise.all(ids.map((id) => answerOf(kingdom, id)))).toEqual([
      ['command.applied', undefined, DEVICES.code.id],
      ['command.applied', undefined, DEVICES.asks.id],
      ['command.rejected', 'passkey_required', DEVICES.asks.id],
      ['command.applied', undefined, DEVICES.full.id],
    ]);
  });

  it("leaves the CLI's commands as they were: no device, no check", async () => {
    const { kingdom, steward } = await open();
    const id = await kingdom.command('create_quest', questPayload('From the CLI'));
    await steward.tick();
    expect(await answerOf(kingdom, id)).toEqual(['command.applied', undefined, undefined]);
  });
});
