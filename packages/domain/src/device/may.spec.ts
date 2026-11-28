// deviceMay (P2-01, ADR 0037): every cell of role × group × scope × source, then what only an inquiry device and a
// revoked or unknown one meet.
import { describe, expect, it } from 'vitest';

import { DeviceSchema } from '../schema/device/device.ts';
import { AWAY, HOME, Q_HOME } from './__fixtures__/world.ts';
import { deviceMay, isDeviceSource } from './may.ts';
import type { CommandGroup } from './groups.ts';
import type { DeviceAsk, DeviceSource } from './may.ts';
import type { CommandScope } from './scopes.ts';

const device = (role: string, territories?: readonly string[], revoked?: string) =>
  DeviceSchema.parse({
    version: 1,
    id: 'dev_20261126_7pzkfv',
    label: 'Phone',
    role,
    ...(territories === undefined ? {} : { territories }),
    created_at: '2026-11-26T09:00:00+07:00',
    ...(revoked === undefined ? {} : { revoked_at: revoked }),
  });

const FULL = device('full');
const SIGNED = { ok: true, value: undefined } as const;
const WRONG = { ok: false, error: { code: 'passkey_mismatch' } } as const;
const PASSKEY = {
  id: 'cred-1',
  public_key: 'MFkw',
  algorithm: 'es256',
  origin: 'https://keep.tail1234.ts.net',
  sign_count: 0,
  added_at: '2026-11-28T08:00:00+07:00',
};
const SCOPED = device('scoped', [HOME]);
const INQUIRY = device('inquiry', [HOME]);

const SCOPES: Readonly<Record<string, CommandScope>> = {
  home: [HOME],
  both: [HOME, AWAY],
  away: [AWAY],
  kingdom: 'kingdom',
};

/**
 * The expected answer of each cell, by source and role: one row per group 1, 2, 3, one word per scope in the order
 * home, both, away, kingdom. ok; out = outside_territories; role = role_forbids; key = passkey_required.
 */
const GRID: Readonly<Record<DeviceSource, Readonly<Record<string, readonly string[]>>>> = {
  herald: {
    full: ['ok ok ok ok', 'ok ok ok ok', 'ok ok ok ok'],
    scoped: ['ok out out out', 'ok out out out', 'role role role role'],
    inquiry: ['ok out out out', 'ok out out out', 'role role role role'],
  },
  lite: {
    full: ['ok ok ok ok', 'key key key key', 'key key key key'],
    scoped: ['ok out out out', 'key out out out', 'role role role role'],
    inquiry: ['ok out out out', 'key out out out', 'role role role role'],
  },
};
const WORDS: Readonly<Record<string, string>> = {
  out: 'outside_territories',
  role: 'role_forbids',
  key: 'passkey_required',
};
const DEVICES = { full: FULL, scoped: SCOPED, inquiry: INQUIRY } as const;

const answer = (ask: DeviceAsk): string => {
  const may = deviceMay(ask);
  return may.ok ? 'ok' : may.error.code;
};

describe('deviceMay: role × group × scope × source', () => {
  const cells = Object.entries(GRID).flatMap(([source, roles]) =>
    Object.entries(roles).flatMap(([role, rows]) =>
      rows.flatMap((row, at) =>
        row.split(' ').map((word, column) => ({
          source: source as DeviceSource,
          role: role as keyof typeof DEVICES,
          group: (at + 1) as CommandGroup,
          scope: Object.keys(SCOPES)[column]!,
          expected: WORDS[word] ?? word,
        })),
      ),
    ),
  );

  it('has every cell', () => {
    expect(cells).toHaveLength(2 * 3 * 3 * 4);
  });

  it.each(cells)(
    '$source, $role, group $group, $scope: $expected',
    ({ source, role, group, scope, expected }) => {
      // An inquiry device asks for a report: the one kind of its own that every cell can try.
      const kind = role === 'inquiry' ? 'create_quest' : 'retry';
      const ask = {
        source,
        device: DEVICES[role],
        kind,
        group,
        scope: SCOPES[scope]!,
        deliverable: 'report',
      } as const;
      expect(answer(ask)).toBe(expected);
    },
  );

  it('lets a phone send groups 2 and 3 once a passkey signed the command (SEC-08)', () => {
    const ask = { source: 'lite', device: FULL, kind: 'seal', group: 2, scope: [HOME] } as const;
    expect(answer({ ...ask, confirmation: SIGNED })).toBe('ok');
    expect(answer({ ...ask, confirmation: undefined })).toBe('passkey_required');
    expect(answer({ ...ask, group: 3, device: SCOPED, confirmation: SIGNED })).toBe('role_forbids');
  });

  it("refuses a signature that does not confirm the command with checkConfirmation's reason, in any group", () => {
    const ask = { device: FULL, kind: 'retry', group: 1, scope: [HOME], confirmation: WRONG } as const;
    expect(answer({ ...ask, source: 'lite' })).toBe('passkey_mismatch');
    expect(answer({ ...ask, source: 'herald', kind: 'seal', group: 2 })).toBe('passkey_mismatch');
  });
});

describe('deviceMay: a device adds its own passkey (SEC-08)', () => {
  const ask = { source: 'lite', kind: 'add_passkey', group: 3, scope: 'kingdom' } as const;
  const keyed = (role: string, territories?: readonly string[]) =>
    DeviceSchema.parse({ ...device(role, territories), passkeys: [PASSKEY] });

  it('takes the first passkey of any role without a signature, as the Herald takes it from a fresh pairing only', () => {
    for (const role of [FULL, SCOPED, INQUIRY]) expect(answer({ ...ask, device: role })).toBe('ok');
  });

  it('needs the signature of a live passkey for every later one, of any role', () => {
    expect(answer({ ...ask, device: keyed('inquiry', [HOME]) })).toBe('passkey_required');
    expect(answer({ ...ask, device: keyed('scoped', [HOME]), confirmation: SIGNED })).toBe('ok');
    const revoked = { ...PASSKEY, revoked_at: '2026-11-28T09:00:00+07:00' };
    expect(answer({ ...ask, device: DeviceSchema.parse({ ...FULL, passkeys: [revoked] }) })).toBe('ok');
  });

  it('still refuses a revoked device, and asks nothing on loopback', () => {
    expect(answer({ ...ask, device: device('full', undefined, '2026-11-28T09:00:00+07:00') })).toBe(
      'device_revoked',
    );
    expect(answer({ ...ask, source: 'herald', device: keyed('full') })).toBe('ok');
  });
});

describe('deviceMay: what an inquiry device may ask', () => {
  const ask = { source: 'herald', device: INQUIRY, group: 1, scope: [HOME] } as const;

  it('asks for a report only, never for work that changes the territory', () => {
    expect(answer({ ...ask, kind: 'create_quest', deliverable: 'report' })).toBe('ok');
    expect(answer({ ...ask, kind: 'create_quest', deliverable: 'branch' })).toBe('role_forbids');
    expect(answer({ ...ask, kind: 'create_quest' })).toBe('role_forbids');
  });

  it('answers or cancels only a read-only quest (P2-01d marks them)', () => {
    const readOnly = { id: Q_HOME.id, read_only: true };
    expect(answer({ ...ask, kind: 'answer', quest: readOnly })).toBe('ok');
    expect(answer({ ...ask, kind: 'cancel', quest: readOnly })).toBe('ok');
    expect(answer({ ...ask, kind: 'answer', quest: { id: Q_HOME.id } })).toBe('role_forbids');
    expect(answer({ ...ask, kind: 'cancel' })).toBe('role_forbids');
  });

  it('sends none of the other kinds, which a scoped device may', () => {
    for (const kind of ['retry', 'seal', 'hold', 'decide_memo'] as const) {
      expect(answer({ ...ask, kind })).toBe('role_forbids');
      expect(answer({ ...ask, kind, device: SCOPED })).toBe('ok');
    }
  });
});

describe('deviceMay: devices that may send nothing', () => {
  const ask = { source: 'herald', kind: 'retry', group: 1, scope: [HOME] } as const;

  it('refuses a command of no device, or of one whose file the caller could not read', () => {
    expect(answer({ ...ask, device: undefined })).toBe('unknown_device');
  });

  it('refuses every command of a revoked device, whatever its role', () => {
    for (const role of [
      device('full', undefined, '2026-11-26T18:00:00+07:00'),
      device('scoped', [HOME], '2026-11-26T18:00:00+07:00'),
    ])
      expect(answer({ ...ask, device: role })).toBe('device_revoked');
  });

  it('gives back the device it lets through', () => {
    expect(deviceMay({ ...ask, device: SCOPED })).toEqual({ ok: true, value: SCOPED });
  });
});

describe('isDeviceSource', () => {
  it('is true for the Herald and the phone only', () => {
    expect(
      ['cli', 'herald', 'lite', 'chancellor', 'monk'].map((source) => isDeviceSource(source as never)),
    ).toEqual([false, true, true, false, false]);
  });
});
