// checkConfirmation (SEC-08, ADR 0038): a passkey signature confirms one command only, from the device's own live
// passkey, through its origin, with a user verified, and with a counter that moves on.
import { describe, expect, it } from 'vitest';

import { commandChallenge } from './challenge.ts';
import type { SignedCommand } from './challenge.ts';
import { checkConfirmation, counterMovesOn } from './confirmation.ts';
import type { Confirmation, Passkey } from '../schema/device/passkey.ts';
import { PASSKEY, answer, confirmationOf, fakeCrypto } from './__fixtures__/fake-passkey.ts';
import type { Answer } from './__fixtures__/fake-passkey.ts';

const SEAL = {
  id: '01JDZ0SEC08AAAAAAAAAAAAAAA',
  kind: 'seal',
  payload: { quest: 'q_20261128_7k3m2a' },
} as unknown as SignedCommand;
const CHALLENGE = commandChallenge(fakeCrypto, SEAL);

const check = (confirmation: Confirmation, passkeys: readonly Passkey[] = [PASSKEY]) => {
  const checked = checkConfirmation({ crypto: fakeCrypto, command: SEAL, confirmation, passkeys });
  return checked.ok ? checked.value : checked.error.code;
};
const bent = (said: Partial<Answer>) => check(confirmationOf(answer(CHALLENGE, said)));

describe('checkConfirmation', () => {
  it("confirms the command its challenge was made of, and gives back the passkey's counter", () => {
    expect(bent({})).toEqual({ passkey: PASSKEY.id, sign_count: 0 });
    expect(
      check(confirmationOf(answer(CHALLENGE, { signCount: 8 })), [{ ...PASSKEY, sign_count: 7 }]),
    ).toEqual({
      passkey: PASSKEY.id,
      sign_count: 8,
    });
  });

  it('refuses a passkey the device does not hold, or one revoked', () => {
    const confirmation = confirmationOf(answer(CHALLENGE));
    expect(check(confirmation, [])).toBe('passkey_unknown');
    expect(check(confirmation, [{ ...PASSKEY, revoked_at: '2026-11-28T09:00:00+07:00' }])).toBe(
      'passkey_revoked',
    );
  });

  it('refuses the signature of another command', () => {
    const other = { ...SEAL, id: '01JDZ0SEC08BBBBBBBBBBBBBBB' as SignedCommand['id'] };
    expect(bent({ challenge: commandChallenge(fakeCrypto, other) })).toBe('passkey_mismatch');
  });

  it('refuses a signature of another ceremony, origin or relying party, or without a verified user', () => {
    expect(bent({ type: 'webauthn.create' })).toBe('passkey_mismatch');
    expect(bent({ origin: 'https://evil.example' })).toBe('passkey_mismatch');
    expect(bent({ crossOrigin: true })).toBe('passkey_mismatch');
    expect(bent({ crossOrigin: false })).toEqual({ passkey: PASSKEY.id, sign_count: 0 });
    expect(bent({ rpId: 'tail1234.ts.net' })).toBe('passkey_mismatch');
    expect(bent({ flags: 0x01 })).toBe('passkey_mismatch');
    expect(bent({ flags: 0x04 })).toBe('passkey_mismatch');
  });

  it('refuses a signature by another key, or bytes that do not decode', () => {
    expect(bent({ publicKey: Uint8Array.of(1, 2, 3) })).toBe('passkey_invalid');
    const good = confirmationOf(answer(CHALLENGE));
    for (const broken of [
      { ...good, signature: 'A' },
      { ...good, authenticator_data: 'AAAA' },
      { ...good, client_data: 'bm90IGpzb24' },
      { ...good, client_data: 'e30' },
    ])
      expect(check(broken)).toBe('passkey_invalid');
    expect(check(good, [{ ...PASSKEY, public_key: 'A' }])).toBe('passkey_invalid');
  });

  it('refuses a counter that does not move on, which is a cloned key or the same signature twice', () => {
    expect(check(confirmationOf(answer(CHALLENGE, { signCount: 7 })), [{ ...PASSKEY, sign_count: 7 }])).toBe(
      'passkey_invalid',
    );
  });
});

describe('counterMovesOn', () => {
  it('lets an authenticator without a counter say 0 forever, and nothing else stand still or go back', () => {
    expect(counterMovesOn(0, 0)).toBe(true);
    expect(counterMovesOn(0, 1)).toBe(true);
    expect(counterMovesOn(3, 4)).toBe(true);
    expect(counterMovesOn(3, 3)).toBe(false);
    expect(counterMovesOn(3, 0)).toBe(false);
  });
});
