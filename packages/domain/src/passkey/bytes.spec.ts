// base64url both ways and the byte helpers of the passkey checks (SEC-08).
import { describe, expect, it } from 'vitest';

import { fromBase64url, joinBytes, sameBytes, textOfBytes, toBase64url } from './bytes.ts';

describe('base64url', () => {
  it('writes the URL alphabet without padding, as a browser writes a challenge', () => {
    expect(toBase64url(Uint8Array.of(0xfb, 0xff))).toBe('-_8');
    expect(toBase64url(Uint8Array.of(0x66, 0x6f, 0x6f, 0x62, 0x61))).toBe('Zm9vYmE');
    expect(toBase64url(new Uint8Array(0))).toBe('');
  });

  it('reads back every length of bytes it writes', () => {
    for (let length = 0; length < 9; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, at) => (at * 97 + 13) & 0xff);
      expect(fromBase64url(toBase64url(bytes))).toEqual(bytes);
    }
  });

  it('refuses padding, the plain alphabet and a stray last digit', () => {
    expect(fromBase64url('Zm8=')).toBeUndefined();
    expect(fromBase64url('+/8')).toBeUndefined();
    expect(fromBase64url('Zm9vY')).toBeUndefined();
  });
});

describe('byte helpers', () => {
  it('reads clientDataJSON one character per byte', () => {
    expect(textOfBytes(Uint8Array.of(0x7b, 0x7d))).toBe('{}');
  });

  it('compares and joins bytes', () => {
    expect(sameBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
    expect(sameBytes(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
    expect(sameBytes(Uint8Array.of(1), Uint8Array.of(1, 2))).toBe(false);
    expect(joinBytes(Uint8Array.of(1), Uint8Array.of(2, 3))).toEqual(Uint8Array.of(1, 2, 3));
  });
});
