// Bytes for the passkey checks without Buffer or atob (ADR 0002: the domain runs in the browser too, and its lib is
// ES2023 only): base64url both ways, clientDataJSON as text, and the comparisons the checks need.
import {
  BASE64_DIGIT_MASK,
  BASE64_GROUP,
  BITS_PER_BASE64_DIGIT,
  BITS_PER_BYTE,
  BIT_BUFFER_MASK,
  BYTE_MASK,
} from './constants.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** The bytes of base64url text without padding; undefined for a character outside the alphabet or a stray digit. */
export function fromBase64url(text: string): Uint8Array | undefined {
  if (text.length % BASE64_GROUP === 1) return undefined;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return undefined;
    buffer = ((buffer << BITS_PER_BASE64_DIGIT) | digit) & BIT_BUFFER_MASK;
    bits += BITS_PER_BASE64_DIGIT;
    if (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      bytes.push((buffer >> bits) & BYTE_MASK);
    }
  }
  return Uint8Array.from(bytes);
}

/** base64url text of `bytes`, without padding, as a browser writes clientDataJSON's `challenge`. */
export function toBase64url(bytes: Uint8Array): string {
  let text = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << BITS_PER_BYTE) | byte) & BIT_BUFFER_MASK;
    bits += BITS_PER_BYTE;
    while (bits >= BITS_PER_BASE64_DIGIT) {
      bits -= BITS_PER_BASE64_DIGIT;
      text += ALPHABET.charAt((buffer >> bits) & BASE64_DIGIT_MASK);
    }
  }
  return bits === 0
    ? text
    : text + ALPHABET.charAt((buffer << (BITS_PER_BASE64_DIGIT - bits)) & BASE64_DIGIT_MASK);
}

/**
 * clientDataJSON as text, one character per byte. Exact for ASCII, and the fields read (type, challenge, origin) are
 * ASCII; a UTF-8 byte of another field is never a quote, a backslash or a brace, so the JSON still parses the same.
 * The signature covers the bytes themselves, never this text.
 */
export const textOfBytes = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, at) => byte === b[at]);

export function joinBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
}
