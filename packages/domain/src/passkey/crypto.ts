// The one piece of a passkey check the domain cannot do itself (ADR 0002: no `crypto` here): hashing and verifying a
// signature. The store hands node:crypto's in (nodePasskeyCrypto); a spec hands a fake that signs by rule.
import type { PasskeyAlgorithm } from '../schema/device/passkey.ts';

export interface PasskeyCrypto {
  /** SHA-256; a string is hashed as its UTF-8 bytes. */
  readonly sha256: (data: string | Uint8Array) => Uint8Array;
  /** Whether `publicKey` (SPKI DER) is a key of `algorithm`: an ES256 passkey with an RSA key is refused. */
  readonly fits: (algorithm: PasskeyAlgorithm, publicKey: Uint8Array) => boolean;
  /** Whether `signature` signs `data` with `publicKey` (SPKI DER) under `algorithm`; false for a key it cannot read. */
  readonly verify: (
    algorithm: PasskeyAlgorithm,
    publicKey: Uint8Array,
    data: Uint8Array,
    signature: Uint8Array,
  ) => boolean;
}
