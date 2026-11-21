// Parity test between the duplicate glob-to-RegExp converters (AH-10, F9, V10; implementation-plan §8).
// packages/hooks/src/glob.ts and packages/runner-core/src/checks/glob.ts are intentionally duplicate
// (hooks may only load node:fs/path/process and eventlog, §1.4). This test ensures they stay in lockstep.
import { describe, expect, it } from 'vitest';

import { globToRegExp as globToRegExpHook } from '../packages/hooks/src/glob.ts';
import { globToRegExp as globToRegExpRunner } from '../packages/runner-core/src/checks/glob.ts';

interface ParityCase {
  readonly glob: string;
  readonly path: string;
  readonly expected?: boolean;
}

const CASES: readonly ParityCase[] = [
  // 1. Double star `**` (start, middle, end, `**/`, whole segment vs within segment)
  { glob: '**/id_rsa', path: 'id_rsa', expected: true },
  { glob: '**/id_rsa', path: 'home/user/.ssh/id_rsa', expected: true },
  { glob: '**/id_rsa', path: 'home/user/.ssh/id_rsa.pub', expected: false },
  { glob: '**/*.ts', path: 'index.ts', expected: true },
  { glob: '**/*.ts', path: 'src/index.ts', expected: true },
  { glob: '**/*.ts', path: 'src/nested/deep/index.ts', expected: true },
  { glob: '**/*.ts', path: 'src/index.js', expected: false },
  { glob: 'a/**/b', path: 'a/b', expected: true },
  { glob: 'a/**/b', path: 'a/x/b', expected: true },
  { glob: 'a/**/b', path: 'a/x/y/b', expected: true },
  { glob: 'a/**/b', path: 'a/x/y/c', expected: false },
  { glob: 'src/**/test.ts', path: 'src/test.ts', expected: true },
  { glob: 'src/**/test.ts', path: 'src/nested/deep/test.ts', expected: true },
  { glob: 'src/**', path: 'src', expected: true },
  { glob: 'src/**', path: 'src/index.ts', expected: true },
  { glob: 'src/**', path: 'src/a/b/c.ts', expected: true },
  { glob: 'src/**', path: 'srcx/index.ts', expected: false },
  { glob: 'infra/secrets/**', path: 'infra/secrets', expected: true },
  { glob: 'infra/secrets/**', path: 'infra/secrets/db/key.txt', expected: true },
  { glob: 'infra/secrets/**', path: 'infra/secretsx', expected: false },
  { glob: 'infra/secrets/**', path: 'infra/other/key.txt', expected: false },
  { glob: '**/bar', path: 'bar', expected: true },
  { glob: '**/bar', path: 'foo/bar', expected: true },
  { glob: 'foo/**/bar', path: 'foo/bar', expected: true },
  { glob: 'foo/**/bar', path: 'foo/a/b/bar', expected: true },
  { glob: 'a**b', path: 'axyb', expected: true },
  { glob: 'a**b', path: 'ax/yb', expected: false },
  { glob: '**', path: 'root.txt', expected: true },
  { glob: '**', path: 'nested/path/to/file.txt', expected: true },

  // 2. Single star `*` (within a single path segment, does not cross `/`)
  { glob: '*.ts', path: 'index.ts', expected: true },
  { glob: '*.ts', path: 'src/index.ts', expected: false },
  { glob: 'a/*/b', path: 'a/x/b', expected: true },
  { glob: 'a/*/b', path: 'a/x/y/b', expected: false },
  { glob: 'dir/*', path: 'dir/file.txt', expected: true },
  { glob: 'dir/*', path: 'dir/sub/file.txt', expected: false },

  // 3. Question mark `?` (single non-slash character)
  { glob: 'file?.txt', path: 'file1.txt', expected: true },
  { glob: 'file?.txt', path: 'file10.txt', expected: false },
  { glob: 'a?b', path: 'axb', expected: true },
  { glob: 'a?b', path: 'a/b', expected: false },

  // 4. File extensions (`*.ts`, `*.spec.ts`, `**/*.spec.ts`)
  { glob: '*.ts', path: 'app.ts', expected: true },
  { glob: '*.ts', path: 'app.js', expected: false },
  { glob: '*.spec.ts', path: 'app.spec.ts', expected: true },
  { glob: '*.spec.ts', path: 'app.test.ts', expected: false },
  { glob: '*.spec.ts', path: 'dir/app.spec.ts', expected: false },
  { glob: '**/*.spec.ts', path: 'app.spec.ts', expected: true },
  { glob: '**/*.spec.ts', path: 'scripts/glob-parity.spec.ts', expected: true },
  { glob: '**/*.spec.ts', path: 'scripts/glob-parity.ts', expected: false },

  // 5. Directories (`src/**`, `a/b/`)
  { glob: 'src/**', path: 'src', expected: true },
  { glob: 'src/**', path: 'src/index.ts', expected: true },
  { glob: 'src/**', path: 'other/src/index.ts', expected: false },
  { glob: 'a/b/', path: 'a/b/', expected: true },
  { glob: 'a/b/', path: 'a/b', expected: false },
  { glob: 'a/b/', path: 'a/b/c', expected: false },

  // 6. Regex special characters in path (`.`, `+`, `(`, `)`, `[`, `]`, `$`, `^`, `{`, `}`, space)
  { glob: 'file.name.ts', path: 'file.name.ts', expected: true },
  { glob: 'file.name.ts', path: 'filexnamexts', expected: false },
  { glob: 'c++/main.cpp', path: 'c++/main.cpp', expected: true },
  { glob: 'c++/main.cpp', path: 'c/main.cpp', expected: false },
  { glob: 'a+b.txt', path: 'a+b.txt', expected: true },
  { glob: 'a+b.txt', path: 'aab.txt', expected: false },
  { glob: 'docs/(draft)/note.md', path: 'docs/(draft)/note.md', expected: true },
  { glob: 'docs/(draft)/note.md', path: 'docs/draft/note.md', expected: false },
  { glob: 'price$(1).txt', path: 'price$(1).txt', expected: true },
  { glob: 'price$(1).txt', path: 'price(1).txt', expected: false },
  { glob: 'price$100.txt', path: 'price$100.txt', expected: true },
  { glob: 'price$100.txt', path: 'price100.txt', expected: false },
  { glob: 'hat^file.txt', path: 'hat^file.txt', expected: true },
  { glob: 'hat^file.txt', path: 'hatfile.txt', expected: false },
  { glob: 'folder name/my file.txt', path: 'folder name/my file.txt', expected: true },
  { glob: 'folder name/*', path: 'folder name/my file.txt', expected: true },
  { glob: ' space ', path: ' space ', expected: true },
  { glob: 'a[b', path: 'a[b', expected: true },
  { glob: 'secret[0-9].txt', path: 'secret7.txt', expected: true },
  { glob: 'secret[0-9].txt', path: 'secretx.txt', expected: false },
  { glob: 'secret[!0-9].txt', path: 'secret7.txt', expected: false },
  { glob: 'secret[!0-9].txt', path: 'secretx.txt', expected: true },
  { glob: '*.{pem,key}', path: 'tls.key', expected: true },
  { glob: '*.{pem,key}', path: 'tls.pem', expected: true },
  { glob: '*.{pem,key}', path: 'tls.crt', expected: false },
  { glob: 'a{b,c}d', path: 'abd', expected: true },
  { glob: 'a{b,c}d', path: 'acd', expected: true },
  { glob: 'a{b,c}d', path: 'ad', expected: false },
  { glob: '{a,b', path: 'a', expected: true },
  { glob: 'a,b}', path: 'a,b}', expected: true },

  // 7. Dotfiles (`.env`, `.env.*`, `.*`)
  { glob: '.env', path: '.env', expected: true },
  { glob: '.env', path: 'a/.env', expected: false },
  { glob: '**/.env', path: '.env', expected: true },
  { glob: '**/.env', path: 'config/.env', expected: true },
  { glob: '.env.*', path: '.env.local', expected: true },
  { glob: '.env.*', path: '.env', expected: false },
  { glob: '.*', path: '.gitignore', expected: true },
  { glob: '.*', path: 'file.txt', expected: false },

  // 8. Slashes and backslashes (`/`, `\`, leading `./` and `/`)
  { glob: 'infra\\secrets/**', path: 'infra/secrets/x', expected: true },
  { glob: 'a\\b\\c.ts', path: 'a/b/c.ts', expected: true },
  { glob: './.env', path: '.env', expected: true },
  { glob: '/infra\\secrets/**', path: 'infra/secrets/x', expected: true },
  { glob: '//src/**', path: 'src/index.ts', expected: true },
  { glob: 'a/b', path: 'a\\b', expected: false },
  { glob: 'infra\\secrets/**', path: 'infra\\secrets\\x', expected: false },

  // 9. Case insensitivity (filesystem compatibility)
  { glob: '.ENV', path: '.env', expected: true },
  { glob: 'SRC/**', path: 'src/index.ts', expected: true },
  { glob: '*.TS', path: 'app.ts', expected: true },
  { glob: '*.ts', path: 'APP.TS', expected: true },
];

describe('glob converter parity (AH-10, F9, V10)', () => {
  it.each(CASES)('matches "$glob" against "$path"', ({ glob, path, expected }) => {
    const hookRegExp = globToRegExpHook(glob);
    const runnerRegExp = globToRegExpRunner(glob);

    const hookMatches = hookRegExp.test(path);
    const runnerMatches = runnerRegExp.test(path);

    expect(hookMatches).toBe(runnerMatches);
    if (expected !== undefined) {
      expect(hookMatches).toBe(expected);
    }
  });
});
