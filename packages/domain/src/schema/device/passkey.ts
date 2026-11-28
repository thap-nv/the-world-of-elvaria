// A device's passkeys (SEC-08, ADR 0031 item 6, ADR 0038): the WebAuthn public keys whose signature the Herald and
// the Steward ask of a phone's command of group 2 or 3. They live in the device file, the trusted configuration only
// the owner's commands write, and every field is base64url (RFC 4648 §5, no padding), as WebAuthn hands them out.
import { z } from 'zod';

import { DateTimeSchema } from '../common.ts';

const describe = (description: string) => ({ description });

/** Base64url without padding: the alphabet of WebAuthn's ids and of the bytes a browser sends. */
const BASE64URL_PATTERN = /^[\w-]+$/;
const base64url = (max: number) => z.string().min(1).max(max).regex(BASE64URL_PATTERN);

/** A credential id is at most 1023 bytes (WebAuthn §5.8.3), 1364 characters of base64url. */
const PASSKEY_ID_MAX_LENGTH = 1364;
/** An SPKI public key: 91 bytes for P-256, 44 for Ed25519, 550 for a 4096-bit RSA key. */
const PUBLIC_KEY_MAX_LENGTH = 1024;
/** authenticatorData with an attested key and extensions, or clientDataJSON with a long origin: a few hundred bytes. */
const SIGNED_DATA_MAX_LENGTH = 4096;
/** A DER ECDSA signature is at most 72 bytes, an RSA one 512. */
const SIGNATURE_MAX_LENGTH = 1024;
/** The authenticator's signature counter is a 32-bit unsigned integer (WebAuthn §6.1.1). */
const SIGN_COUNT_MAX = 0xff_ff_ff_ff;

export const PasskeyIdSchema = base64url(PASSKEY_ID_MAX_LENGTH).brand<'PasskeyId'>();
export type PasskeyId = z.infer<typeof PasskeyIdSchema>;

export const AuthenticatorDataSchema = base64url(SIGNED_DATA_MAX_LENGTH);
export const ClientDataSchema = base64url(SIGNED_DATA_MAX_LENGTH);
export const SignatureSchema = base64url(SIGNATURE_MAX_LENGTH);
export const SignCountSchema = z.int().min(0).max(SIGN_COUNT_MAX);

/** The COSE algorithms a platform authenticator offers: ES256 (-7), RS256 (-257, Windows Hello), EdDSA (-8). */
export const PASSKEY_ALGORITHMS = ['es256', 'rs256', 'ed25519'] as const;
export type PasskeyAlgorithm = (typeof PASSKEY_ALGORITHMS)[number];

/** The tunnel's origin: WebAuthn needs HTTPS and a host name, so a loopback origin never registers a passkey. */
export const PasskeyOriginSchema = z.string().regex(/^https:\/\/[\da-z.-]+(?::\d{1,5})?$/);

/** What the Herald learns of a new passkey when it checked the browser's registration; the Steward adds the time. */
export const NewPasskeySchema = z.strictObject({
  id: PasskeyIdSchema.meta(describe('The credential id (`PublicKeyCredential.rawId`).')),
  public_key: base64url(PUBLIC_KEY_MAX_LENGTH).meta(
    describe('The public key as SPKI DER (`AuthenticatorAttestationResponse.getPublicKey()`).'),
  ),
  algorithm: z.enum(PASSKEY_ALGORITHMS),
  origin: PasskeyOriginSchema.meta(
    describe(
      'The origin it was registered through: an assertion must come from it, and its host is the relying party id.',
    ),
  ),
  sign_count: SignCountSchema.meta(
    describe(
      "The authenticator's signature counter last seen; 0 for an authenticator that keeps none (a synced passkey). A signature whose counter does not move past it is refused.",
    ),
  ),
});
export type NewPasskey = z.infer<typeof NewPasskeySchema>;

export const PasskeySchema = NewPasskeySchema.extend({
  added_at: DateTimeSchema,
  revoked_at: DateTimeSchema.optional().meta(
    describe('Set by `revoke_device` naming this passkey: from then on a signature by it is refused.'),
  ),
});
export type Passkey = z.infer<typeof PasskeySchema>;

/**
 * A passkey's signature on one command (`navigator.credentials.get`, user verified), as the Herald writes it into the
 * command for the Steward to check again: the challenge it signed is commandChallenge of the command (ADR 0038).
 */
export const ConfirmationSchema = z.strictObject({
  passkey: PasskeyIdSchema,
  authenticator_data: AuthenticatorDataSchema,
  client_data: ClientDataSchema.meta(describe('clientDataJSON, as the browser serialized it.')),
  signature: SignatureSchema,
});
export type Confirmation = z.infer<typeof ConfirmationSchema>;

/**
 * A new passkey as the browser hands it out (`navigator.credentials.create`, attestation `none`, user verified): the
 * key as SPKI so nothing parses CBOR, and the two signed pieces whose challenge the Herald issued (ADR 0038).
 */
export const RegistrationSchema = NewPasskeySchema.pick({
  id: true,
  public_key: true,
  algorithm: true,
}).extend({
  authenticator_data: AuthenticatorDataSchema,
  client_data: ClientDataSchema,
});
export type Registration = z.infer<typeof RegistrationSchema>;
