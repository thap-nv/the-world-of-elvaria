import { describe, expect, it } from 'vitest';

import { localeProblems, namespaceProblems } from './locale-problems.ts';
import type { LocaleFile } from './locales/namespace.ts';

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

describe('namespaceProblems', () => {
  it('finds nothing when every key sits in its longest namespace, in both locales', () => {
    const vi = { cli: file({ 'cli.yes': 'Có' }), 'cli.quest': file({ 'cli.quest.list.title': 'Quest' }) };
    const en = { cli: file({ 'cli.yes': 'Yes' }), 'cli.quest': file({ 'cli.quest.list.title': 'Quests' }) };
    expect(namespaceProblems({ vi, en }, 'vi')).toEqual([]);
  });

  it('reports a key in the wrong file, a key no namespace holds and a wrong version', () => {
    const vi = {
      cli: file({ 'cli.quest.list.title': 'Quest', 'store.busy': 'Bận' }, 2),
      'cli.quest': file({ 'cli.quest.done': 'Xong' }),
    };
    expect(namespaceProblems({ vi }, 'vi')).toEqual([
      'vi/cli.json: version 2, expected 1',
      'vi/cli.json: "cli.quest.list.title" belongs in vi/cli-quest.json',
      'vi/cli.json: "store.busy" belongs in no namespace',
    ]);
  });

  it('reports a namespace missing on either side and two namespaces sharing one file', () => {
    const vi = { cli: file({}), quest: file({}) };
    const en = { cli: file({}), 'tribe.look': file({}), tribe_look: file({}) };
    expect(namespaceProblems({ vi, en }, 'vi')).toEqual([
      'en: namespace "tribe_look" shares the file tribe-look.json',
      'en: no namespace "quest" (in vi)',
      'en: namespace "tribe.look" is not in vi',
      'en: namespace "tribe_look" is not in vi',
    ]);
  });

  it('needs the reference locale', () => {
    expect(namespaceProblems({ en: {} }, 'vi')).toEqual(['no vi namespaces']);
  });
});
