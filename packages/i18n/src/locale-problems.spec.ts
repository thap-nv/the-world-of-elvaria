import { describe, expect, it } from 'vitest';

import { localeProblems } from './locale-problems.ts';
import type { LocaleFile } from './messages.ts';

const file = (messages: Record<string, string>, version = 1): LocaleFile => ({ version, messages });

describe('localeProblems', () => {
  it('finds nothing when every locale has the same keys and placeholders', () => {
    const vi = file({ 'quest.created': 'Đã tạo {title}', 'locale.vi': 'Tiếng Việt' });
    const en = file({ 'quest.created': 'Created {title}', 'locale.vi': 'Tiếng Việt' });
    expect(localeProblems({ vi, en }, 'vi')).toEqual([]);
  });

  it('reports a key missing on either side', () => {
    const vi = file({ 'a.one': 'một', 'a.two': 'hai' });
    const en = file({ 'a.one': 'one', 'a.three': 'three' });
    expect(localeProblems({ vi, en }, 'vi')).toEqual([
      'en: missing "a.two" (in vi)',
      'en: "a.three" is not in vi',
    ]);
  });

  it('reports placeholders that differ from the reference', () => {
    const vi = file({ 'quest.created': 'Đã tạo {title} cho {name}', 'quest.done': 'Xong' });
    const en = file({ 'quest.created': 'Created {name}', 'quest.done': 'Done {title}' });
    expect(localeProblems({ vi, en }, 'vi')).toEqual([
      'en: "quest.created" has placeholders {name}, vi has {name} {title}',
      'en: "quest.done" has placeholders {title}, vi has none',
    ]);
  });

  it('reports a wrong version, a key that is not dotted snake_case and an empty string', () => {
    const vi = file({ questCreated: 'x', 'a.b': ' ' }, 2);
    expect(localeProblems({ vi }, 'vi')).toEqual([
      'vi: version 2, expected 1',
      'vi: key "questCreated" is not dotted snake_case',
      'vi: "a.b" is empty',
    ]);
  });

  it('needs the reference locale', () => {
    expect(localeProblems({ en: file({}) }, 'vi')).toEqual(['no vi locale file']);
  });
});
