// What pair_device, set_device, revoke_device and add_passkey make of a device file (SEC-08), as `herald pair`,
// `herald device` and `herald revoke` do on the machine.
import { describe, expect, it } from 'vitest';

import { DeviceSchema } from '../schema/device/device.ts';
import type { Device, DeviceRole } from '../schema/device/device.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { NewPasskey, PasskeyId } from '../schema/device/passkey.ts';
import { changedDevice, pairedDevice, revokedDevice, withPasskey, withSignCount } from './change.ts';
import type { DeviceId, TerritoryId } from '../core/ids.ts';

const AT = '2026-11-28T10:00:00+07:00';
const LATER = '2026-11-28T11:00:00+07:00';
const ATTACHED = new Set(['do-an', 'handbook']);
const attached = (id: TerritoryId) => ATTACHED.has(id);
const KEY: NewPasskey = {
  id: 'cred-1' as PasskeyId,
  public_key: 'MFkw',
  algorithm: 'es256',
  origin: 'https://keep.tail1234.ts.net',
  sign_count: 3,
};
const SCOPED = DeviceSchema.parse({
  version: 1,
  id: 'dev_20261128_4k2pqz',
  label: 'Phone',
  role: 'scoped',
  territories: ['do-an'],
  created_at: '2026-11-28T09:00:00+07:00',
  passkeys: [{ ...KEY, added_at: '2026-11-28T09:01:00+07:00' }],
});
const FULL: Device = {
  version: 1,
  id: SCOPED.id,
  label: 'Phone',
  role: 'full',
  created_at: SCOPED.created_at,
};
const ids = (...names: readonly string[]) => names as TerritoryId[];

const pair = (role: DeviceRole, territories?: readonly string[]) => {
  const payload: CommandPayload<'pair_device'> = {
    device: 'dev_20261128_9tw3hx' as DeviceId,
    label: 'Tablet',
    role,
    ...(territories === undefined ? {} : { territories: ids(...territories) }),
  };
  return pairedDevice(payload, AT, attached);
};
const change = (current: Device, payload: Omit<CommandPayload<'set_device'>, 'device'>) =>
  changedDevice(current, { device: current.id, ...payload }, attached);

describe('pairedDevice', () => {
  it('makes the device file of a pair_device at the time of the command', () => {
    expect(pair('full')).toEqual({
      ok: true,
      value: { version: 1, id: 'dev_20261128_9tw3hx', label: 'Tablet', role: 'full', created_at: AT },
    });
    expect(pair('inquiry', ['handbook'])).toMatchObject({
      ok: true,
      value: { territories: ids('handbook') },
    });
  });

  it('refuses a grant the role does not take, and a territory not attached', () => {
    expect(pair('full', ['do-an'])).toEqual({ ok: false, error: 'bad_grant' });
    expect(pair('scoped')).toEqual({ ok: false, error: 'bad_grant' });
    expect(pair('scoped', ['elsewhere'])).toEqual({ ok: false, error: 'unknown_territory' });
  });
});

describe('changedDevice', () => {
  it('changes the label alone, keeping the grant and the passkeys', () => {
    expect(change(SCOPED, { label: 'Old phone' })).toEqual({
      ok: true,
      value: { ...SCOPED, label: 'Old phone' },
    });
  });

  it('keeps the territories of a limited role that becomes another limited role, unless it names others', () => {
    expect(change(SCOPED, { role: 'inquiry' })).toMatchObject({
      ok: true,
      value: { territories: ['do-an'] },
    });
    expect(change(SCOPED, { territories: ids('handbook') })).toMatchObject({
      ok: true,
      value: { role: 'scoped', territories: ['handbook'] },
    });
  });

  it('drops the territories of a device made full, and asks some of a full device made limited', () => {
    const full = change(SCOPED, { role: 'full' });
    expect(full).toMatchObject({ ok: true, value: { role: 'full', passkeys: SCOPED.passkeys } });
    expect(full.ok && 'territories' in full.value).toBe(false);
    expect(change(FULL, { role: 'scoped' })).toEqual({ ok: false, error: 'bad_grant' });
    expect(change(FULL, { role: 'scoped', territories: ids('do-an') })).toMatchObject({ ok: true });
  });

  it('refuses a revoked device and a territory not attached', () => {
    expect(change({ ...SCOPED, revoked_at: AT }, { label: 'x' })).toEqual({
      ok: false,
      error: 'device_revoked',
    });
    expect(change(SCOPED, { territories: ids('elsewhere') })).toEqual({
      ok: false,
      error: 'unknown_territory',
    });
  });
});

describe('revokedDevice', () => {
  it('revokes the device once: a second revoke keeps the first time', () => {
    const revoked = revokedDevice(SCOPED, undefined, AT);
    expect(revoked).toEqual({ ok: true, value: { ...SCOPED, revoked_at: AT } });
    expect(revokedDevice({ ...SCOPED, revoked_at: AT }, undefined, LATER)).toEqual(revoked);
  });

  it('revokes one passkey only, once, and refuses one the device does not hold', () => {
    const once = revokedDevice(SCOPED, KEY.id, AT);
    expect(once).toEqual({
      ok: true,
      value: { ...SCOPED, passkeys: [{ ...SCOPED.passkeys![0], revoked_at: AT }] },
    });
    expect(once.ok && revokedDevice(once.value, KEY.id, LATER)).toEqual(once);
    expect(revokedDevice(FULL, KEY.id, AT)).toEqual({ ok: false, error: 'passkey_unknown' });
    const two = withPasskey(SCOPED, { ...KEY, id: 'cred-2' as PasskeyId }, AT);
    expect(two.ok && revokedDevice(two.value, KEY.id, AT)).toMatchObject({
      ok: true,
      value: { passkeys: [{ revoked_at: AT }, { id: 'cred-2' }] },
    });
  });
});

describe('withPasskey', () => {
  it('adds a passkey at the time of the command', () => {
    expect(withPasskey(FULL, KEY, AT)).toEqual({
      ok: true,
      value: { ...FULL, passkeys: [{ ...KEY, added_at: AT }] },
    });
  });

  it('refuses an id the device holds, and a revoked device', () => {
    expect(withPasskey(SCOPED, KEY, AT)).toEqual({ ok: false, error: 'passkey_exists' });
    expect(withPasskey({ ...FULL, revoked_at: AT }, KEY, AT)).toEqual({ ok: false, error: 'device_revoked' });
  });
});

describe('withSignCount', () => {
  it("moves the passkey's counter on, never back, and leaves the other passkeys", () => {
    const two = withPasskey(SCOPED, { ...KEY, id: 'cred-2' as PasskeyId }, AT);
    const device = two.ok ? two.value : SCOPED;
    const moved = withSignCount(device, { passkey: KEY.id, sign_count: 9 });
    expect(moved.passkeys?.map(({ sign_count }) => sign_count)).toEqual([9, 3]);
    expect(withSignCount(moved, { passkey: KEY.id, sign_count: 4 }).passkeys?.[0]?.sign_count).toBe(9);
    expect(withSignCount(FULL, { passkey: KEY.id, sign_count: 4 }).passkeys).toEqual([]);
  });
});
