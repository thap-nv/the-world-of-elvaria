import { describe, expect, it } from 'vitest';

import { localeProblems } from './locale-problems.ts';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_FILES,
  format,
  isLocale,
  placeholdersOf,
  translator,
} from './messages.ts';

describe('translator', () => {
  it('reads the string of the locale it was made for', () => {
    expect(translator('vi')('sandbox.fake_data')).toBe('DỮ LIỆU GIẢ');
    expect(translator('en')('sandbox.fake_data')).toBe('FAKE DATA');
  });

  it('defaults to Vietnamese, the language the owner reads (ADR 0014)', () => {
    expect(DEFAULT_LOCALE).toBe('vi');
    expect(LOCALES).toEqual(['vi', 'en']);
  });

  it('ships locale files that i18n:check accepts', () => {
    expect(localeProblems(LOCALE_FILES, DEFAULT_LOCALE)).toEqual([]);
  });
});

describe('format', () => {
  it('fills every placeholder, repeated or not', () => {
    expect(format('{name} gặp {name} lúc {hour} giờ', { name: 'Thorn', hour: 9 })).toBe(
      'Thorn gặp Thorn lúc 9 giờ',
    );
  });

  it('leaves a placeholder without a value as written, so the gap shows', () => {
    expect(format('Chào {name}')).toBe('Chào {name}');
    expect(format('Chào {name}', { other: 'x' })).toBe('Chào {name}');
  });

  it('ignores braces that are not placeholders', () => {
    expect(format('{ } {Name} {1x}', { Name: 'no' })).toBe('{ } {Name} {1x}');
  });
});

describe('placeholdersOf', () => {
  it('lists each name once, sorted', () => {
    expect(placeholdersOf('{b} {a} {b}')).toEqual(['a', 'b']);
    expect(placeholdersOf('none here')).toEqual([]);
  });
});

describe('isLocale', () => {
  it('accepts exactly the shipped locales', () => {
    expect(isLocale('vi')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});
