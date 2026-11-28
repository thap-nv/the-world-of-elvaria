// A passkey without node:crypto, for the domain's specs (no Node types here): a 32-byte FNV hash stands for SHA-256,
// and a key "signs" by hashing itself with the data. Enough to tell every refusal apart; the store's spec checks the
// same functions with real keys of node:crypto.
import { toBase64url } from '../bytes.ts';
import type { PasskeyCrypto } from '../crypto.ts';
import type { Confirmation, Passkey, Registration } from '../../schema/device/passkey.ts';

const HASH_LENGTH = 32;
const FNV_OFFSET = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;

function fakeHash(data: string | Uint8Array): Uint8Array {
  const units = typeof data === 'string' ? [...data].map((char) => char.codePointAt(0) ?? 0) : [...data];
  const out = new Uint8Array(HASH_LENGTH);
  let hash = FNV_OFFSET;
  for (let at = 0; at < HASH_LENGTH; at += 1) {
    for (const unit of [at, ...units]) hash = Math.imul(hash ^ unit, FNV_PRIME);
    out[at] = hash & 0xff;
  }
  return out;
}

/** The first byte of a fake key says its algorithm. */
const ALGORITHM_TAGS = { es256: 1, rs256: 2, ed25519: 3 } as const;

export const ascii = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0));
const join = (...parts: readonly Uint8Array[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((part) => [...part]));

const fakeSign = (publicKey: Uint8Array, data: Uint8Array): Uint8Array => fakeHash(join(publicKey, data));

export const fakeCrypto: PasskeyCrypto = {
  sha256: fakeHash,
  fits: (algorithm, publicKey) => publicKey[0] === ALGORITHM_TAGS[algorithm],
  verify: (_algorithm, publicKey, data, signature) =>
    toBase64url(fakeSign(publicKey, data)) === toBase64url(signature),
};

export const ORIGIN = 'https://keep.tail1234.ts.net';
const PUBLIC_KEY = Uint8Array.of(ALGORITHM_TAGS.es256, 7, 7, 7);
const CREDENTIAL_ID = Uint8Array.of(9, 8, 7, 6, 5);

export const PASSKEY: Passkey = {
  id: toBase64url(CREDENTIAL_ID) as Passkey['id'],
  public_key: toBase64url(PUBLIC_KEY),
  algorithm: 'es256',
  origin: ORIGIN,
  sign_count: 0,
  added_at: '2026-11-28T08:00:00+07:00',
};

/** What a WebAuthn answer says; each field can be bent to meet one refusal. */
export interface Answer {
  readonly type: string;
  readonly challenge: string;
  readonly origin: string;
  readonly rpId: string;
  readonly flags: number;
  readonly signCount: number;
  readonly crossOrigin?: boolean;
  /** Attested credential data: the id the authenticator says it made, or bytes cut short. */
  readonly attested?: Uint8Array;
  readonly publicKey?: Uint8Array;
}

const USER_PRESENT_VERIFIED = 0x05;
const ATTESTED = 0x40;

export const answer = (challenge: string, bent: Partial<Answer> = {}): Answer => ({
  type: 'webauthn.get',
  challenge,
  origin: ORIGIN,
  rpId: 'keep.tail1234.ts.net',
  flags: USER_PRESENT_VERIFIED,
  signCount: 0,
  ...bent,
});

const uint32 = (value: number): Uint8Array =>
  Uint8Array.of(value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);

/** authenticatorData of `said`, with attested credential data (aaguid, id length, id) when `attested` is set. */
export function authenticatorBytes(said: Answer): Uint8Array {
  const head = join(fakeHash(said.rpId), Uint8Array.of(said.flags), uint32(said.signCount));
  return said.attested === undefined ? head : join(head, new Uint8Array(16), said.attested);
}

export const clientBytes = (said: Answer): Uint8Array =>
  ascii(
    JSON.stringify({
      type: said.type,
      challenge: said.challenge,
      origin: said.origin,
      ...(said.crossOrigin === undefined ? {} : { crossOrigin: said.crossOrigin }),
    }),
  );

/** The confirmation PASSKEY gives for `said`. */
export function confirmationOf(said: Answer): Confirmation {
  const authenticator = authenticatorBytes(said);
  const client = clientBytes(said);
  const signature = fakeSign(said.publicKey ?? PUBLIC_KEY, join(authenticator, fakeHash(client)));
  return {
    passkey: PASSKEY.id,
    authenticator_data: toBase64url(authenticator),
    client_data: toBase64url(client),
    signature: toBase64url(signature),
  };
}

/** The id's length then the id, as attested credential data carries them. */
export const attestedId = (id: Uint8Array = CREDENTIAL_ID): Uint8Array =>
  join(Uint8Array.of(0, id.length), id);

/** The registration the browser hands out for `said`, made with ATTESTED and CREDENTIAL_ID unless bent. */
export function registrationOf(said: Answer): Registration {
  const made = { ...said, flags: said.flags | ATTESTED, attested: said.attested ?? attestedId() };
  return {
    id: PASSKEY.id,
    public_key: toBase64url(said.publicKey ?? PUBLIC_KEY),
    algorithm: 'es256',
    authenticator_data: toBase64url(authenticatorBytes(made)),
    client_data: toBase64url(clientBytes(made)),
  };
}
