// Is this the passkey the browser just made for us (SEC-08, ADR 0038)? The Herald asks when a device registers one
// through the tunnel, before it writes the add_passkey command. Attestation `none`: the browser's word for the key is
// all there is, so the check is the ceremony (our fresh challenge, the tunnel's origin, a verified user), the id the
// authenticator put in its data, and a public key of the algorithm the browser named.
import { err, ok } from '../core/result.ts';
import type { Result } from '../core/result.ts';
import type { NewPasskey, Registration } from '../schema/device/passkey.ts';
import { fromBase64url, sameBytes } from './bytes.ts';
import { answers, signedDataOf } from './ceremony.ts';
import type { PasskeyRefusal } from './ceremony.ts';
import type { PasskeyCrypto } from './crypto.ts';

export interface RegistrationAsk {
  readonly crypto: PasskeyCrypto;
  /** The challenge the Herald issued for this registration, base64url. */
  readonly challenge: string;
  /** The tunnel origin the device's stream came through. */
  readonly origin: NewPasskey['origin'];
  readonly registration: Registration;
}

/** The passkey to add to the device when `registration` is the one the Herald asked for; else why not. */
export function checkRegistration(ask: RegistrationAsk): Result<NewPasskey, PasskeyRefusal> {
  const { crypto, registration } = ask;
  const signed = signedDataOf(registration.authenticator_data, registration.client_data);
  const id = fromBase64url(registration.id);
  const publicKey = fromBase64url(registration.public_key);
  if (signed === undefined || id === undefined || publicKey === undefined)
    return err({ code: 'passkey_invalid' });
  const made = signed.authenticator.credentialId;
  if (
    !answers(crypto, signed, { type: 'webauthn.create', challenge: ask.challenge, origin: ask.origin }) ||
    made === undefined ||
    !sameBytes(made, id)
  )
    return err({ code: 'passkey_mismatch' });
  if (!crypto.fits(registration.algorithm, publicKey)) return err({ code: 'passkey_invalid' });
  return ok({
    id: registration.id,
    public_key: registration.public_key,
    algorithm: registration.algorithm,
    origin: ask.origin,
    sign_count: signed.authenticator.signCount,
  });
}
