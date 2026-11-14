// Every infirmary reason code has a sentence in every locale, with exactly the params the contract names
// (contract infirmary-reason-codes §2), so `quest show`, the bell and the timeline never print a bare key.
import { INFIRMARY_REASON_PARAMS, INFIRMARY_REASONS } from '@elvaria/domain';
import { LOCALE_FILES, LOCALES, placeholdersOf, translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { reasonKeyOf, reasonText } from './infirmary-reason.ts';

describe('infirmary reason codes', () => {
  it('maps a code to its key', () => {
    expect(reasonKeyOf('breaker:commit_errors')).toBe('cli.quest.infirmary.reason.breaker.commit_errors');
    expect(reasonKeyOf('quest:max_attempts')).toBe('cli.quest.infirmary.reason.quest.max_attempts');
    expect(reasonKeyOf('legacy')).toBe('cli.quest.infirmary.reason.legacy');
  });

  it.each(LOCALES)('has a sentence for every code in %s, with exactly its params', (locale) => {
    const { messages } = LOCALE_FILES[locale];
    for (const code of INFIRMARY_REASONS) {
      const template = messages[reasonKeyOf(code)];
      expect(template, code).toBeDefined();
      expect(placeholdersOf(template ?? ''), code).toEqual(INFIRMARY_REASON_PARAMS[code].toSorted());
    }
  });

  it('fills every placeholder of every code', () => {
    for (const locale of LOCALES) {
      const t = translator(locale);
      for (const code of INFIRMARY_REASONS) {
        const params = Object.fromEntries(INFIRMARY_REASON_PARAMS[code].map((key) => [key, 7]));
        expect(reasonText(t, { code, params }), code).not.toMatch(/\{[a-z_]+\}/);
      }
    }
  });

  it('puts each hook line under the sentence, indented and verbatim, and nothing when the hook said nothing', () => {
    const t = translator('en');
    const params = { lines: 'Error: x\n  at y', total_lines: 2, log: '.runs/q-1/pre-commit.log' };
    expect(reasonText(t, { code: 'breaker:commit', params }).split('\n')).toEqual([
      'the pre-commit hook refused the commit, so the branch lacks the work; its output has 2 lines (in full at .runs/q-1/pre-commit.log), the first ones below',
      '  Error: x',
      '    at y',
    ]);
    expect(reasonText(t, { code: 'breaker:commit', params: { ...params, lines: '' } })).not.toContain('\n');
  });

  it('says the old words of a line written before the codes verbatim', () => {
    const text = 'breaker:time: ran 45 min, limit 45 min';
    expect(reasonText(translator('vi'), { code: 'legacy', params: { text } })).toBe(text);
  });
});
