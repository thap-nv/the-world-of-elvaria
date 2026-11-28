// node:crypto behind the domain's PasskeyCrypto port (SEC-08, ADR 0038): the store reads the device files whose
// passkeys these keys are, and both of their readers that check a signature, the Herald and the Steward, already
// depend on it, so one adapter serves both. A key node cannot read, or of another type than its passkey says, fails.
import { createHash, createPublicKey, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import type { PasskeyAlgorithm, PasskeyCrypto } from '@elvaria/domain';

/** The digest node's verify takes for each algorithm; Ed25519 hashes inside and takes none. */
const DIGESTS: Readonly<Record<PasskeyAlgorithm, string | null>> = {
  es256: 'sha256',
  rs256: 'sha256',
  ed25519: null,
};

/** Whether a key is the kind its algorithm needs: ES256 is ECDSA on P-256 only. */
const KEY_FITS: Readonly<Record<PasskeyAlgorithm, (key: KeyObject) => boolean>> = {
  es256: (key) => key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1',
  rs256: (key) => key.asymmetricKeyType === 'rsa',
  ed25519: (key) => key.asymmetricKeyType === 'ed25519',
};

function keyOf(algorithm: PasskeyAlgorithm, spki: Uint8Array): KeyObject | undefined {
  try {
    const key = createPublicKey({ key: Buffer.from(spki), format: 'der', type: 'spki' });
    return KEY_FITS[algorithm](key) ? key : undefined;
  } catch {
    return undefined;
  }
}

export const nodePasskeyCrypto: PasskeyCrypto = {
  sha256: (data) => new Uint8Array(createHash('sha256').update(data).digest()),
  fits: (algorithm, publicKey) => keyOf(algorithm, publicKey) !== undefined,
  verify: (algorithm, publicKey, data, signature) => {
    const key = keyOf(algorithm, publicKey);
    if (key === undefined) return false;
    try {
      return verify(DIGESTS[algorithm], data, key, signature);
    } catch {
      return false;
    }
  },
};
