import { describe, expect, it } from 'vitest';

import { LOCALE_FILE_VERSION, merged, namespaceFile, namespaceOf } from './namespace.ts';

describe('namespaceFile', () => {
  it('names the file in kebab-case, like every file id', () => {
    expect(namespaceFile('cli.seal_raise')).toBe('cli-seal-raise.json');
    expect(namespaceFile('tribe_look')).toBe('tribe-look.json');
    expect(namespaceFile('store')).toBe('store.json');
  });
});

describe('namespaceOf', () => {
  const names = ['cli', 'cli.quest', 'quest'];

  it('picks the longest namespace that prefixes the key', () => {
    expect(namespaceOf('cli.quest.list.title', names)).toBe('cli.quest');
    expect(namespaceOf('cli.yes', names)).toBe('cli');
    expect(namespaceOf('quest.status.open', names)).toBe('quest');
  });

  it('matches whole segments only, and says when no namespace fits', () => {
    expect(namespaceOf('cli.quests.title', names)).toBe('cli');
    expect(namespaceOf('questing.title', names)).toBeUndefined();
  });
});

describe('merged', () => {
  it('joins every namespace into one file, in namespace order', () => {
    const file = merged({
      cli: { version: 1, messages: { 'cli.yes': 'Có' } },
      quest: { version: 1, messages: { 'quest.done': 'Xong', 'quest.open': 'Mở' } },
    });
    expect(file).toEqual({
      version: LOCALE_FILE_VERSION,
      messages: { 'cli.yes': 'Có', 'quest.done': 'Xong', 'quest.open': 'Mở' },
    });
    expect(Object.keys(file.messages)).toEqual(['cli.yes', 'quest.done', 'quest.open']);
  });
});
