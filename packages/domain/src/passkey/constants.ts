// The byte layout of WebAuthn's authenticatorData (§6.1) and of base64url (RFC 4648 §5), for the passkey checks.

export const BITS_PER_BYTE = 8;
export const BITS_PER_BASE64_DIGIT = 6;
/** Four base64 digits carry three bytes; a lone digit after the last group carries none, so no text ends so. */
export const BASE64_GROUP = 4;
export const BYTE_MASK = 0xff;
export const BASE64_DIGIT_MASK = 0x3f;
/** Enough bits for a byte and a digit waiting to be read; the rest are dropped so the number stays small. */
export const BIT_BUFFER_MASK = 0xff_ff;

/** rpIdHash (32), flags (1), signCount (4). */
export const RP_ID_HASH_LENGTH = 32;
export const FLAGS_OFFSET = 32;
export const SIGN_COUNT_OFFSET = 33;
export const AUTHENTICATOR_DATA_MIN_LENGTH = 37;
/** Attested credential data follows: aaguid (16), the credential id's length (2), the id, the COSE key. */
export const AAGUID_LENGTH = 16;
export const CREDENTIAL_ID_LENGTH_SIZE = 2;

/** User present, user verified, attested credential data included. */
export const FLAG_USER_PRESENT = 0x01;
export const FLAG_USER_VERIFIED = 0x04;
export const FLAG_ATTESTED = 0x40;
