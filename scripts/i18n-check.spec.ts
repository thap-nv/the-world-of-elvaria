import { GLOSSARY, LOCALE_FILES } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { run } from './i18n-check.mjs';

describe('i18n:check', () => {
  it('passes on the shipped locale files and glossary', () => {
    // Counted, not written down: every task adds strings (P0-08 added the CLI's).
    const keys = Object.keys(LOCALE_FILES.vi.messages).length;
    expect(keys).toBeGreaterThan(3);
    expect(run()).toEqual({ code: 0, text: `i18n:check: ${keys} keys in vi, en; glossary.json well-formed` });
  });

  it('fails on an English key Vietnamese does not have, and on a malformed glossary', () => {
    const en = { ...LOCALE_FILES.en, messages: { ...LOCALE_FILES.en.messages, 'quest.extra': 'Extra' } };
    expect(run({ ...LOCALE_FILES, en }, { ...GLOSSARY, version: 0 })).toEqual({
      code: 1,
      text: [
        'i18n:check: 2 problems',
        'en: "quest.extra" is not in vi',
        'glossary: version 0, expected 1',
      ].join('\n'),
    });
  });
});
