// SEC-08 at the Steward (ADR 0038): a phone's command of group 2 or 3 is applied only with a passkey signature on that
// very command, checked again against the device file; the device commands write device files as the CLI does, from
// a full device only.
import { testPasskey } from '@elvaria/testkit';
import { afterEach, describe, expect, it } from 'vitest';

import { bench } from '../__fixtures__/kingdom.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import {
  DEVICES,
  KEY,
  NEW,
  OTHER_KEY,
  TS,
  answersOf,
  deviceFile,
  send,
  withDevices,
} from '../__fixtures__/paired-devices.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

async function open() {
  current = await bench();
  await withDevices(current);
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const PAIR = { device: NEW, label: 'Tablet', role: 'scoped', territories: ['handbook'] };

describe('a passkey signature on a command from the phone (SEC-08)', () => {
  it('applies a command of group 3 signed for itself, and refuses one unsigned, signed for another, or by a revoked key', async () => {
    const { kingdom, steward } = await open();
    const ids = [
      await send(kingdom, 'owner', 'set_device', { device: DEVICES.docs.id, label: 'Unsigned' }),
      await send(
        kingdom,
        'owner',
        'set_device',
        { device: DEVICES.docs.id, label: 'Other' },
        { key: KEY, for: '01JD0000000000000000000000' },
      ),
      await send(
        kingdom,
        'owner',
        'set_device',
        { device: DEVICES.docs.id, label: 'Revoked key' },
        { key: OTHER_KEY },
      ),
      await send(
        kingdom,
        'owner',
        'set_device',
        { device: DEVICES.docs.id, label: 'Signed' },
        { key: KEY, signCount: 4 },
      ),
    ];
    await steward.tick();
    expect(await answersOf(kingdom, ids)).toEqual([
      'passkey_required',
      'passkey_mismatch',
      'passkey_revoked',
      'applied',
    ]);
    expect((await deviceFile(kingdom, DEVICES.docs.id))?.label).toBe('Signed');
    // The counter the signature reached is kept: the same count again would be refused.
    expect(
      (await deviceFile(kingdom, DEVICES.owner.id))?.passkeys?.map(({ sign_count }) => sign_count),
    ).toEqual([4, 0]);
    const again = await send(
      kingdom,
      'owner',
      'set_device',
      { device: DEVICES.docs.id, label: 'Again' },
      { key: KEY, signCount: 4 },
    );
    await steward.tick();
    expect(await answersOf(kingdom, [again])).toEqual(['passkey_invalid']);
  });

  it('asks nothing of the loopback, and keeps the passkeys of a device it changes', async () => {
    const { kingdom, steward } = await open();
    const id = await send(
      kingdom,
      'owner',
      'set_device',
      { device: DEVICES.owner.id, label: 'Desk' },
      { source: 'herald' },
    );
    await steward.tick();
    expect(await answersOf(kingdom, [id])).toEqual(['applied']);
    expect(await deviceFile(kingdom, DEVICES.owner.id)).toMatchObject({
      label: 'Desk',
      passkeys: [{ id: KEY.id }, { id: OTHER_KEY.id }],
    });
  });
});

describe('the device commands (SEC-08)', () => {
  it('pairs a device from a full device, once, on attached territories only', async () => {
    const { kingdom, steward } = await open();
    const ids = [
      await send(kingdom, 'owner', 'pair_device', PAIR, { key: KEY }),
      await send(kingdom, 'owner', 'pair_device', PAIR, { key: KEY, signCount: 1 }),
      await send(
        kingdom,
        'owner',
        'pair_device',
        { ...PAIR, device: 'dev_20261107_aaaaaa', territories: ['elsewhere'] },
        { key: KEY, signCount: 2 },
      ),
      await send(
        kingdom,
        'owner',
        'pair_device',
        { ...PAIR, device: 'dev_20261107_bbbbbb', role: 'full' },
        { key: KEY, signCount: 3 },
      ),
    ];
    await steward.tick();
    expect(await answersOf(kingdom, ids)).toEqual([
      'applied',
      'device_exists',
      'unknown_territory',
      'bad_grant',
    ]);
    expect(await deviceFile(kingdom, NEW)).toEqual({
      version: 1,
      id: NEW,
      label: 'Tablet',
      role: 'scoped',
      territories: ['handbook'],
      created_at: TS,
    });
  });

  it('refuses the three kinds from a scoped or inquiry device, and from the Chancellor', async () => {
    const { kingdom, steward } = await open();
    const ids = [];
    for (const device of ['docs', 'asks'] as const)
      ids.push(
        await send(kingdom, device, 'pair_device', PAIR, { source: 'herald' }),
        await send(
          kingdom,
          device,
          'set_device',
          { device: DEVICES[device].id, role: 'full' },
          { source: 'herald' },
        ),
        await send(kingdom, device, 'revoke_device', { device: DEVICES.owner.id }, { source: 'herald' }),
      );
    ids.push(
      await send(kingdom, 'owner', 'revoke_device', { device: DEVICES.owner.id }, { source: 'chancellor' }),
    );
    await steward.tick();
    expect(await answersOf(kingdom, ids)).toEqual([...Array<string>(6).fill('role_forbids'), 'owner_only']);
    expect((await deviceFile(kingdom, DEVICES.owner.id))?.revoked_at).toBeUndefined();
  });

  it('revokes a device, or one of its passkeys, whose signatures are refused from then on', async () => {
    const { kingdom, steward } = await open();
    const ids = [
      await send(
        kingdom,
        'owner',
        'revoke_device',
        { device: DEVICES.owner.id, passkey: KEY.id },
        { key: KEY },
      ),
      await send(kingdom, 'owner', 'revoke_device', { device: DEVICES.asks.id }, { key: KEY, signCount: 1 }),
      await send(kingdom, 'owner', 'revoke_device', { device: 'dev_20261107_cccccc' }, { source: 'herald' }),
    ];
    await steward.tick();
    expect(await answersOf(kingdom, ids)).toEqual(['applied', 'passkey_revoked', 'unknown_device']);
    const later = await send(
      kingdom,
      'owner',
      'revoke_device',
      { device: DEVICES.asks.id },
      { source: 'herald' },
    );
    await steward.tick();
    expect(await answersOf(kingdom, [later])).toEqual(['applied']);
    expect((await deviceFile(kingdom, DEVICES.asks.id))?.revoked_at).toBe(TS);
    expect((await deviceFile(kingdom, DEVICES.owner.id))?.passkeys?.[0]?.revoked_at).toBe(TS);
  });

  it("adds a device's first passkey unsigned, from any role, and a later one only with a live passkey's signature", async () => {
    const { kingdom, steward } = await open();
    const fresh = testPasskey('ed25519');
    const newKey = {
      id: fresh.id,
      public_key: fresh.public_key,
      algorithm: 'ed25519',
      origin: fresh.origin,
      sign_count: 0,
    };
    const ids = [
      await send(kingdom, 'asks', 'add_passkey', { passkey: newKey }),
      await send(kingdom, 'owner', 'add_passkey', { passkey: newKey }),
      await send(kingdom, 'owner', 'add_passkey', { passkey: newKey }, { key: KEY }),
      await send(
        kingdom,
        'owner',
        'add_passkey',
        { passkey: { ...newKey, id: KEY.id } },
        { key: KEY, signCount: 1 },
      ),
    ];
    await steward.tick();
    expect(await answersOf(kingdom, ids)).toEqual([
      'applied',
      'passkey_required',
      'applied',
      'passkey_exists',
    ]);
    expect((await deviceFile(kingdom, DEVICES.asks.id))?.passkeys).toEqual([{ ...newKey, added_at: TS }]);
    expect((await deviceFile(kingdom, DEVICES.owner.id))?.passkeys?.map(({ id }) => id)).toEqual([
      KEY.id,
      OTHER_KEY.id,
      fresh.id,
    ]);
  });
});
