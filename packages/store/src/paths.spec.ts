import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { comparePath, fromPortable, inKingdom, staysInside, toPortable } from './paths.ts';

describe('toPortable and fromPortable (implementation-plan §2.1, §6)', () => {
  it('writes Windows paths with / and reads them back with \\', () => {
    expect(toPortable('D:\\Dummy\\Tool - Personal\\kingdom', 'win32')).toBe(
      'D:/Dummy/Tool - Personal/kingdom',
    );
    expect(fromPortable('D:/Dummy/Tool - Personal/kingdom', 'win32')).toBe(
      'D:\\Dummy\\Tool - Personal\\kingdom',
    );
    expect(fromPortable('quests/q_20261106_7k3m2a.json', 'win32')).toBe('quests\\q_20261106_7k3m2a.json');
  });

  it('leaves POSIX paths alone, where a backslash is part of a name', () => {
    expect(toPortable('/Users/thap/a\\b', 'darwin')).toBe('/Users/thap/a\\b');
    expect(fromPortable('quests/q_20261106_7k3m2a.json', 'darwin')).toBe('quests/q_20261106_7k3m2a.json');
  });

  it('round-trips on the machine running the tests', () => {
    const native = path.join('a b', 'c', 'd.json');
    expect(fromPortable(toPortable(native))).toBe(native);
  });

  it('resolves a portable path inside the kingdom', () => {
    expect(inKingdom(path.join('root dir'), 'inbox/done/x.json')).toBe(
      path.join('root dir', 'inbox', 'done', 'x.json'),
    );
  });
});

describe('staysInside', () => {
  it.each(['kinds.json', 'scripts/link-check.mjs', 'a/../b.json', './prompts/judge.md'])(
    'accepts %s',
    (file) => {
      expect(staysInside(file)).toBe(true);
    },
  );

  it.each(['../kingdom.json', 'scripts/../../x', '/etc/passwd', 'C:\\Windows\\x', '..\\up', '..'])(
    'refuses %s',
    (file) => {
      expect(staysInside(file)).toBe(false);
    },
  );
});

describe('comparePath (implementation-plan §6)', () => {
  it('ignores case and separator style on Windows', () => {
    expect(comparePath('D:\\Repo\\Elvaria', 'd:/repo/elvaria/', 'win32')).toBe(0);
    expect(comparePath('C:\\a', 'C:\\b', 'win32')).toBe(-1);
    expect(comparePath('C:\\b', 'c:\\A', 'win32')).toBe(1);
  });

  it('is exact on POSIX, apart from a trailing slash', () => {
    expect(comparePath('/Users/a', '/users/a', 'darwin')).not.toBe(0);
    expect(comparePath('/Users/a/', '/Users/a', 'darwin')).toBe(0);
    expect(comparePath('/', '/', 'linux')).toBe(0);
  });

  it('defaults to the running platform', () => {
    expect(comparePath(path.join('x', 'y'), path.join('x', 'y'))).toBe(0);
  });
});
