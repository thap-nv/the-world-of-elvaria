// The two signed pieces of a WebAuthn answer (§6.1 authenticatorData, §5.8.1 clientDataJSON) and the checks both
// ceremonies share: the right ceremony, our challenge, the passkey's origin and relying party, a user present and
// verified (ADR 0031 item 6: an assertion with user verification). Pure: the hashing comes in through the port.
import { z } from 'zod';

import { fromBase64url, sameBytes, textOfBytes } from './bytes.ts';
import {
  AAGUID_LENGTH,
  AUTHENTICATOR_DATA_MIN_LENGTH,
  CREDENTIAL_ID_LENGTH_SIZE,
  FLAGS_OFFSET,
  FLAG_ATTESTED,
  FLAG_USER_PRESENT,
  FLAG_USER_VERIFIED,
  RP_ID_HASH_LENGTH,
  SIGN_COUNT_OFFSET,
} from './constants.ts';
import type { PasskeyCrypto } from './crypto.ts';

/** Why a passkey's answer is refused; also the reason of the Herald's `refused` and the Steward's command.rejected. */
export const PASSKEY_REFUSALS = [
  /** The command names a passkey its device does not hold. */
  'passkey_unknown',
  'passkey_revoked',
  /** A signature by the passkey, of something else: another command, another ceremony or origin, no user check. */
  'passkey_mismatch',
  /** Not a signature by the passkey, bytes that do not decode, or a counter that did not move on. */
  'passkey_invalid',
] as const;
export type PasskeyRefusalCode = (typeof PASSKEY_REFUSALS)[number];
export interface PasskeyRefusal {
  readonly code: PasskeyRefusalCode;
}

interface AuthenticatorData {
  readonly rpIdHash: Uint8Array;
  readonly flags: number;
  readonly signCount: number;
  /** The id inside attested credential data, when the authenticator included it (a registration). */
  readonly credentialId: Uint8Array | undefined;
}

function attestedIdOf(bytes: Uint8Array, view: DataView): Uint8Array | undefined {
  const lengthAt = AUTHENTICATOR_DATA_MIN_LENGTH + AAGUID_LENGTH;
  const start = lengthAt + CREDENTIAL_ID_LENGTH_SIZE;
  if (bytes.length < start) return undefined;
  const end = start + view.getUint16(lengthAt);
  return bytes.length < end ? undefined : bytes.slice(start, end);
}

function authenticatorDataOf(bytes: Uint8Array): AuthenticatorData | undefined {
  if (bytes.length < AUTHENTICATOR_DATA_MIN_LENGTH) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint8(FLAGS_OFFSET);
  return {
    rpIdHash: bytes.slice(0, RP_ID_HASH_LENGTH),
    flags,
    signCount: view.getUint32(SIGN_COUNT_OFFSET),
    credentialId: (flags & FLAG_ATTESTED) === 0 ? undefined : attestedIdOf(bytes, view),
  };
}

/** The fields of clientDataJSON the checks read; a browser may add others (`topOrigin`, a note to developers). */
const ClientDataJsonSchema = z.object({
  type: z.string(),
  challenge: z.string(),
  origin: z.string(),
  crossOrigin: z.boolean().optional(),
});
type ClientDataJson = z.infer<typeof ClientDataJsonSchema>;

function clientDataOf(bytes: Uint8Array): ClientDataJson | undefined {
  try {
    const parsed = ClientDataJsonSchema.safeParse(JSON.parse(textOfBytes(bytes)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** A WebAuthn answer, decoded: the raw bytes the signature covers, and what they say. */
export interface SignedData {
  readonly authenticatorBytes: Uint8Array;
  readonly clientBytes: Uint8Array;
  readonly authenticator: AuthenticatorData;
  readonly client: ClientDataJson;
}

/** The answer's two pieces from base64url; undefined when either does not decode or parse. */
export function signedDataOf(authenticatorData: string, clientData: string): SignedData | undefined {
  const authenticatorBytes = fromBase64url(authenticatorData);
  const clientBytes = fromBase64url(clientData);
  const authenticator = authenticatorBytes && authenticatorDataOf(authenticatorBytes);
  const client = clientBytes && clientDataOf(clientBytes);
  if (!authenticatorBytes || !clientBytes || !authenticator || !client) return undefined;
  return { authenticatorBytes, clientBytes, authenticator, client };
}

/** The relying party id of an origin the passkey schema allows: its host, without the port. */
const rpIdOf = (origin: string): string => origin.slice('https://'.length).replace(/:\d+$/, '');

export interface Ceremony {
  readonly type: 'webauthn.create' | 'webauthn.get';
  readonly challenge: string;
  readonly origin: string;
}

/** Whether `signed` answers `ceremony`: our challenge, from the passkey's origin, with a user present and verified. */
export function answers(crypto: PasskeyCrypto, signed: SignedData, ceremony: Ceremony): boolean {
  const { client, authenticator } = signed;
  const userChecked = FLAG_USER_PRESENT | FLAG_USER_VERIFIED;
  return (
    client.type === ceremony.type &&
    client.challenge === ceremony.challenge &&
    client.origin === ceremony.origin &&
    client.crossOrigin !== true &&
    sameBytes(authenticator.rpIdHash, crypto.sha256(rpIdOf(ceremony.origin))) &&
    (authenticator.flags & userChecked) === userChecked
  );
}
