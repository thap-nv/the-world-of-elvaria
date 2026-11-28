// The domain's passkey checks with node:crypto's keys (SEC-08, ADR 0038): what a real browser and authenticator send
// is confirmed for its command only, and registered as the key it is, for each of the three algorithms.
import { checkConfirmation, checkRegistration, commandChallenge } from '@elvaria/domain';
import type { Passkey, PasskeyId, SignedCommand } from '@elvaria/domain';
import { TEST_PASSKEY_ORIGIN, testPasskey } from '@elvaria/testkit';
import type { TestPasskey, TestPasskeyAlgorithm } from '@elvaria/testkit';
import { describe, expect, it } from 'vitest';

import { nodePasskeyCrypto } from './passkey-crypto.ts';

const SEAL = {
  id: '01JDZ0SEC08AAAAAAAAAAAAAAA',
  kind: 'seal',
  payload: { quest: 'q_20261128_7k3m2a', note: 'Đã xem trên điện thoại' },
} as unknown as SignedCommand;

const stored = (passkey: TestPasskey): Passkey => ({
  id: passkey.id as PasskeyId,
  public_key: passkey.public_key,
  algorithm: passkey.algorithm,
  origin: passkey.origin,
  sign_count: 0,
  added_at: '2026-11-28T09:00:00+07:00',
});

const confirm = (passkey: TestPasskey, signedFor: SignedCommand, keys = [stored(passkey)]) => {
  const confirmation = passkey.sign(commandChallenge(nodePasskeyCrypto, signedFor)) as never;
  const checked = checkConfirmation({
    crypto: nodePasskeyCrypto,
    command: SEAL,
    confirmation,
    passkeys: keys,
  });
  return checked.ok ? 'ok' : checked.error.code;
};

describe.each<TestPasskeyAlgorithm>(['es256', 'rs256', 'ed25519'])(
  'nodePasskeyCrypto with %s',
  (algorithm) => {
    const passkey = testPasskey(algorithm);

    it('confirms the command a real passkey signed, and nothing else', () => {
      expect(confirm(passkey, SEAL)).toBe('ok');
      expect(confirm(passkey, { ...SEAL, kind: 'return' })).toBe('passkey_mismatch');
    });

    it('refuses the signature of another key held under this id', () => {
      const other = { ...stored(testPasskey(algorithm)), id: passkey.id as PasskeyId };
      expect(confirm(passkey, SEAL, [other])).toBe('passkey_invalid');
    });

    it('registers the key the browser made for the challenge', () => {
      const registration = passkey.register('ZnJlc2gtY2hhbGxlbmdl') as never;
      const checked = checkRegistration({
        crypto: nodePasskeyCrypto,
        challenge: 'ZnJlc2gtY2hhbGxlbmdl',
        origin: TEST_PASSKEY_ORIGIN,
        registration,
      });
      expect(checked).toEqual({
        ok: true,
        value: {
          id: passkey.id,
          public_key: passkey.public_key,
          algorithm,
          origin: TEST_PASSKEY_ORIGIN,
          sign_count: 0,
        },
      });
    });
  },
);

describe('nodePasskeyCrypto', () => {
  const es256 = testPasskey('es256');
  const key = Buffer.from(es256.public_key, 'base64url');

  it('says a key fits only the algorithm of its type, and no bytes that are no key', () => {
    expect(nodePasskeyCrypto.fits('es256', key)).toBe(true);
    expect(nodePasskeyCrypto.fits('rs256', key)).toBe(false);
    expect(nodePasskeyCrypto.fits('ed25519', key)).toBe(false);
    expect(nodePasskeyCrypto.fits('es256', Uint8Array.of(1, 2, 3))).toBe(false);
  });

  it('verifies nothing with a key of another type, or a signature that is no signature', () => {
    const data = Uint8Array.of(1, 2, 3);
    expect(nodePasskeyCrypto.verify('rs256', key, data, Uint8Array.of(0))).toBe(false);
    expect(nodePasskeyCrypto.verify('es256', key, data, Uint8Array.of(0x30, 0x02))).toBe(false);
    const ed = Buffer.from(testPasskey('ed25519').public_key, 'base64url');
    expect(nodePasskeyCrypto.verify('ed25519', ed, data, Uint8Array.of(1))).toBe(false);
  });

  it('hashes text as UTF-8, as the challenge of a payload in Vietnamese needs', () => {
    expect(Buffer.from(nodePasskeyCrypto.sha256('ừ')).toString('hex')).toBe(
      Buffer.from(nodePasskeyCrypto.sha256(Buffer.from('ừ', 'utf8'))).toString('hex'),
    );
    expect(Buffer.from(nodePasskeyCrypto.sha256('')).toString('hex')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
