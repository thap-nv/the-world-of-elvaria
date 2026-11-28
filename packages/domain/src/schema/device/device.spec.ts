// device v1 (P2-01, ADR 0037): a full device carries no territories, a scoped or inquiry one at least one.
import { describe, expect, it } from 'vitest';

import examples from '../../../examples/device.json' with { type: 'json' };
import { DeviceSchema } from './device.ts';

const SCOPED = examples[1]!;

describe('DeviceSchema', () => {
  it('reads the three roles of the examples, a revoked device among them', () => {
    expect(examples.map((example) => DeviceSchema.parse(example).role)).toEqual([
      'full',
      'scoped',
      'inquiry',
    ]);
    expect(DeviceSchema.parse(examples[2]).revoked_at).toBe('2026-11-26T17:45:00+07:00');
  });

  it('refuses a full device that names territories, and a limited one that names none', () => {
    expect(DeviceSchema.safeParse({ ...examples[0], territories: ['dc1-se-team'] }).success).toBe(false);
    expect(DeviceSchema.safeParse({ ...SCOPED, territories: [] }).success).toBe(false);
    const { territories: _none, ...bare } = SCOPED;
    expect(DeviceSchema.safeParse({ ...bare, role: 'inquiry' }).success).toBe(false);
  });

  it('refuses a role it does not know, a territory twice, an id of another shape and an empty label', () => {
    expect(DeviceSchema.safeParse({ ...SCOPED, role: 'admin' }).success).toBe(false);
    expect(DeviceSchema.safeParse({ ...SCOPED, territories: ['dc1-se-team', 'dc1-se-team'] }).success).toBe(
      false,
    );
    expect(DeviceSchema.safeParse({ ...SCOPED, id: 'phone-1' }).success).toBe(false);
    expect(DeviceSchema.safeParse({ ...SCOPED, label: '' }).success).toBe(false);
    expect(DeviceSchema.safeParse({ ...SCOPED, label: 'x'.repeat(65) }).success).toBe(false);
  });

  it('keeps the passkeys a device registered (SEC-08), each once, from an HTTPS origin only', () => {
    const passkey = SCOPED.passkeys![0]!;
    expect(DeviceSchema.parse(SCOPED).passkeys?.map(({ id }) => id)).toEqual(['Pz3Vr0bq2y8xWQ4k1nB7tg']);
    expect(DeviceSchema.safeParse({ ...SCOPED, passkeys: [passkey, passkey] }).success).toBe(false);
    for (const origin of ['http://127.0.0.1:7411', 'https://Keep.example', 'https://keep.example/path'])
      expect(DeviceSchema.safeParse({ ...SCOPED, passkeys: [{ ...passkey, origin }] }).success).toBe(false);
    expect(
      DeviceSchema.safeParse({ ...SCOPED, passkeys: [{ ...passkey, algorithm: 'ps256' }] }).success,
    ).toBe(false);
    expect(DeviceSchema.safeParse({ ...SCOPED, passkeys: [{ ...passkey, sign_count: -1 }] }).success).toBe(
      false,
    );
  });
});
