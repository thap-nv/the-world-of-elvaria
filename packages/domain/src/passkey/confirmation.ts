// Does this passkey signature confirm this command (SEC-08, ADR 0038)? The Herald asks before it writes a phone's
// command of group 2 or 3 to inbox/, and the Steward asks again when it applies it: the passkey must be the device's
// and not revoked, the signature its own, over our challenge of this command, and its counter must move on.
import { err, ok } from '../core/result.ts';
import type { Result } from '../core/result.ts';
import type { Confirmation, Passkey, PasskeyId } from '../schema/device/passkey.ts';
import { fromBase64url, joinBytes } from './bytes.ts';
import { answers, signedDataOf } from './ceremony.ts';
import type { PasskeyRefusal, PasskeyRefusalCode } from './ceremony.ts';
import { commandChallenge } from './challenge.ts';
import type { SignedCommand } from './challenge.ts';
import type { PasskeyCrypto } from './crypto.ts';

/** The passkey that confirmed, and its counter now, which the Steward writes back to the device file. */
export interface PasskeyUse {
  readonly passkey: PasskeyId;
  readonly sign_count: number;
}

export interface ConfirmationAsk {
  readonly crypto: PasskeyCrypto;
  readonly command: SignedCommand;
  readonly confirmation: Confirmation;
  /** The device file's passkeys, revoked ones included. */
  readonly passkeys: readonly Passkey[];
}

const refuse = (code: PasskeyRefusalCode): Result<never, PasskeyRefusal> => err({ code });

/**
 * A counter that moves on (WebAuthn §6.1.1); an authenticator that keeps none says 0 every time, and a synced passkey
 * is such one, so 0 after 0 passes. A counter that did not grow is a cloned key, or the same signature again.
 */
export const counterMovesOn = (stored: number, received: number): boolean =>
  received > stored || (stored === 0 && received === 0);

/** The passkey and its counter when `confirmation` confirms `command`; else the first reason, in check order. */
export function checkConfirmation(ask: ConfirmationAsk): Result<PasskeyUse, PasskeyRefusal> {
  const { crypto, confirmation } = ask;
  const passkey = ask.passkeys.find(({ id }) => id === confirmation.passkey);
  if (passkey === undefined) return refuse('passkey_unknown');
  if (passkey.revoked_at !== undefined) return refuse('passkey_revoked');
  const signed = signedDataOf(confirmation.authenticator_data, confirmation.client_data);
  const publicKey = fromBase64url(passkey.public_key);
  const signature = fromBase64url(confirmation.signature);
  if (signed === undefined || publicKey === undefined || signature === undefined)
    return refuse('passkey_invalid');
  // WebAuthn §7.2 step 20: the signature covers authenticatorData followed by the hash of clientDataJSON.
  const data = joinBytes(signed.authenticatorBytes, crypto.sha256(signed.clientBytes));
  if (!crypto.verify(passkey.algorithm, publicKey, data, signature)) return refuse('passkey_invalid');
  const challenge = commandChallenge(crypto, ask.command);
  if (!answers(crypto, signed, { type: 'webauthn.get', challenge, origin: passkey.origin }))
    return refuse('passkey_mismatch');
  const count = signed.authenticator.signCount;
  if (!counterMovesOn(passkey.sign_count, count)) return refuse('passkey_invalid');
  return ok({ passkey: passkey.id, sign_count: count });
}
