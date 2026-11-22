// Numbers of the ids (implementation-plan §2.1).

/** Crockford base32 without i, l, o, u, lowercase: readable in logs and never mistaken for 1 or 0. */
export const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const DATED_ID_RANDOM_CHARS = 6;
export const BITS_PER_BASE32_CHAR = 5;
export const BYTE_BITS = 8;
export const ULID_TIME_CHARS = 10;
export const ULID_RANDOM_CHARS = 16;
export const ULID_RANDOM_BYTES = 10;
export const ULID_MAX_TIME_MS = 2 ** 48 - 1;
