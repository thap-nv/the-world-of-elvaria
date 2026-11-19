import { describe, expect, it } from 'vitest';

import { LESSON_REF_PATTERN, LESSON_TEXT_REF_PATTERN } from '../core/ids.ts';
import { lineOf } from './__fixtures__/scripture.ts';
import { lessonRefOf, lessonTextKeyOf, lessonTextRefOf } from './ref.ts';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

describe('lesson refs (PS-12, DB5)', () => {
  it('reads a sentence in one form and one case, its runs of spaces as one', () => {
    expect(lessonTextKeyOf('  Write  files\twith LF.  ')).toBe('write files with lf.');
    expect(lessonTextKeyOf('Café')).toBe(lessonTextKeyOf('Café'));
  });

  it('formats ten base32 digits from the top 50 bits of a digest', () => {
    expect(lessonTextRefOf(bytes(0, 0, 0, 0, 0, 0, 0, 0))).toBe('T_0000000000');
    expect(lessonTextRefOf(bytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff))).toBe('T_zzzzzzzzzz');
    expect(lessonTextRefOf(bytes(0x08, 0, 0, 0, 0, 0, 0))).toBe('T_1000000000');
    expect(lessonTextRefOf(bytes(1, 2, 3, 4, 5, 6, 7))).toMatch(LESSON_TEXT_REF_PATTERN);
  });

  it("names a line by its id, without hashing, or by its sentence's hash", () => {
    const hashed: string[] = [];
    const digestOf = (key: string): Uint8Array => {
      hashed.push(key);
      return bytes(0x08, 0, 0, 0, 0, 0, 0);
    };
    expect(lessonRefOf(lineOf('- [L_20261119_4k2pqz] Rule.'), digestOf)).toBe('L_20261119_4k2pqz');
    expect(hashed).toEqual([]);
    expect(lessonRefOf(lineOf('- {role=verifier} Write  LF.'), digestOf)).toBe('T_1000000000');
    expect(hashed).toEqual(['write lf.']);
  });

  it('accepts both kinds of ref in a load trace, and nothing else', () => {
    expect(LESSON_REF_PATTERN.test('L_20261119_4k2pqz')).toBe(true);
    expect(LESSON_REF_PATTERN.test('T_0123456789')).toBe(true);
    expect(LESSON_REF_PATTERN.test('T_012345678')).toBe(false);
    expect(LESSON_REF_PATTERN.test('L_20261119_4k2pqzx')).toBe(false);
    expect(LESSON_REF_PATTERN.test('T_01234567uu')).toBe(false);
  });
});
