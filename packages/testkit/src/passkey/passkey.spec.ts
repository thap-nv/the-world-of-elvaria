// testPasskey signs as WebAuthn does: over authenticatorData and the hash of clientDataJSON, with the key it hands out.
import { createHash, createPublicKey, verify } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { TEST_PASSKEY_ORIGIN, testPasskey } from './passkey.ts';
import type { TestPasskeyAlgorithm } from './passkey.ts';

const bytes = (base64url: string): Buffer => Buffer.from(base64url, 'base64url');

describe('testPasskey', () => {
  it.each<[TestPasskeyAlgorithm, string | null]>([
    ['es256', 'sha256'],
    ['rs256', 'sha256'],
    ['ed25519', null],
  ])('signs a challenge with its %s key, as the browser of the tunnel', (algorithm, digest) => {
    const passkey = testPasskey(algorithm);
    const assertion = passkey.sign('Y2hhbGxlbmdl', { signCount: 3 });
    const authenticator = bytes(assertion.authenticator_data);
    const signed = Buffer.concat([
      authenticator,
      createHash('sha256').update(bytes(assertion.client_data)).digest(),
    ]);
    const key = createPublicKey({ key: bytes(passkey.public_key), format: 'der', type: 'spki' });
    expect(verify(digest, signed, key, bytes(assertion.signature))).toBe(true);
    expect(JSON.parse(bytes(assertion.client_data).toString())).toEqual({
      type: 'webauthn.get',
      challenge: 'Y2hhbGxlbmdl',
      origin: TEST_PASSKEY_ORIGIN,
      crossOrigin: false,
    });
    expect(authenticator.subarray(0, 32)).toEqual(
      createHash('sha256').update('keep.tail1234.ts.net').digest(),
    );
    expect([authenticator[32], authenticator.readUInt32BE(33)]).toEqual([0x05, 3]);
  });

  it('registers with its credential id in the attested data', () => {
    const passkey = testPasskey('es256', 'https://other.example:8443');
    const made = passkey.register('Y3JlYXRl');
    const authenticator = bytes(made.authenticator_data);
    expect(authenticator[32]).toBe(0x45);
    expect(authenticator.subarray(55, 55 + authenticator.readUInt16BE(53))).toEqual(bytes(passkey.id));
    expect(JSON.parse(bytes(made.client_data).toString())).toMatchObject({
      type: 'webauthn.create',
      origin: 'https://other.example:8443',
    });
  });
});
