// checkRegistration (SEC-08, ADR 0038): the passkey the browser made for the Herald's challenge, through the tunnel,
// with a verified user, the id it says, and a key of the algorithm it names.
import { describe, expect, it } from 'vitest';

import { checkRegistration } from './registration.ts';
import type { Registration } from '../schema/device/passkey.ts';
import {
  ORIGIN,
  PASSKEY,
  answer,
  attestedId,
  fakeCrypto,
  registrationOf,
} from './__fixtures__/fake-passkey.ts';
import type { Answer } from './__fixtures__/fake-passkey.ts';

const CHALLENGE = 'cmVnaXN0ZXItbWU';
const MADE = answer(CHALLENGE, { type: 'webauthn.create', signCount: 2 });

const check = (registration: Registration) => {
  const checked = checkRegistration({
    crypto: fakeCrypto,
    challenge: CHALLENGE,
    origin: ORIGIN,
    registration,
  });
  return checked.ok ? checked.value : checked.error.code;
};
const bent = (said: Partial<Answer>) => check(registrationOf({ ...MADE, ...said }));

describe('checkRegistration', () => {
  it('gives the passkey to add, with the origin it came through and its counter', () => {
    expect(bent({})).toEqual({
      id: PASSKEY.id,
      public_key: PASSKEY.public_key,
      algorithm: 'es256',
      origin: ORIGIN,
      sign_count: 2,
    });
  });

  it('refuses an answer to another challenge or ceremony, from another origin, or without a verified user', () => {
    expect(bent({ challenge: 'b3RoZXI' })).toBe('passkey_mismatch');
    expect(bent({ type: 'webauthn.get' })).toBe('passkey_mismatch');
    expect(bent({ origin: 'https://evil.example' })).toBe('passkey_mismatch');
    expect(bent({ flags: 0x01 })).toBe('passkey_mismatch');
  });

  it('refuses a credential whose authenticator data names another id, or none it can read', () => {
    expect(bent({ attested: attestedId(Uint8Array.of(1, 2, 3)) })).toBe('passkey_mismatch');
    expect(bent({ attested: Uint8Array.of(0) })).toBe('passkey_mismatch');
    expect(bent({ attested: Uint8Array.of(0, 5, 9) })).toBe('passkey_mismatch');
  });

  it('refuses a key of another algorithm than the one named, and bytes that do not decode', () => {
    expect(bent({ publicKey: Uint8Array.of(2, 7, 7) })).toBe('passkey_invalid');
    const good = registrationOf(MADE);
    for (const broken of [
      { ...good, id: 'A' },
      { ...good, public_key: 'A' },
      { ...good, client_data: 'A' },
    ] as Registration[])
      expect(check(broken)).toBe('passkey_invalid');
  });
});
