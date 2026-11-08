import { describe, expect, it } from 'vitest';

import { headerPaths, numstatPaths, patchProblem, unquoteGitPath } from './patch-scope.ts';

const HUSKY = ['.husky/**'];

describe('unquoteGitPath', () => {
  it('reads the C quoting git uses for a special name, and leaves a plain one alone', () => {
    expect(unquoteGitPath('"sp ace\\tx.txt"')).toBe('sp ace\tx.txt');
    expect(unquoteGitPath('"a\\"b\\\\c"')).toBe('a"b\\c');
    expect(unquoteGitPath('"caf\\303\\251.md"')).toBe('café.md');
    expect(unquoteGitPath('"\\q"')).toBe('q');
    expect(unquoteGitPath('.husky/pre-push')).toBe('.husky/pre-push');
    expect(unquoteGitPath('"')).toBe('"');
  });
});

describe('numstatPaths', () => {
  it('takes the path of each entry of `git apply --numstat -z`', () => {
    expect(numstatPaths('1\t0\t.husky/pre-push\0-\t-\tbin/logo.png\0')).toEqual([
      '.husky/pre-push',
      'bin/logo.png',
    ]);
    expect(numstatPaths('')).toEqual([]);
  });
});

describe('headerPaths', () => {
  it('reads both sides of every header, as git reads them with -p1', () => {
    const patch = [
      'diff --git a/.husky/pre-push b/.husky/pre-push',
      'index 1111111..2222222 100755',
      '--- a/.husky/pre-push',
      '+++ b/.husky/pre-push',
      '@@ -1 +1,2 @@',
      ' pnpm test',
      '+pnpm lint',
      'diff --git a/.husky/pre-commit b/.husky/pre-commit',
      'new file mode 100755',
      '--- /dev/null',
      '+++ b/.husky/pre-commit\t2026-11-08 20:00:00',
    ].join('\r\n');
    expect(new Set(headerPaths(patch))).toEqual(new Set(['.husky/pre-push', '.husky/pre-commit']));
  });

  it('catches what a rename takes away, which `--numstat` does not name', () => {
    const patch =
      'diff --git a/src/app.ts b/.husky/app.ts\nrename from src/app.ts\nrename to .husky/app.ts\n';
    expect(headerPaths(patch)).toContain('src/app.ts');
    expect(headerPaths('rename old "a b.ts"\n')).toEqual(['a b.ts']);
  });

  it('reads a header whose two names differ, which git applies as a rename too', () => {
    const patch = 'diff --git a/src/app.ts b/.husky/app.ts\n--- a/src/app.ts\n+++ b/.husky/app.ts\n';
    expect(headerPaths(patch)).toEqual(['src/app.ts', '.husky/app.ts']);
    // The header line alone gives a name only when both halves agree, as in git.
    expect(headerPaths('diff --git a/x y b/z\n')).toEqual([]);
    expect(headerPaths('diff --git "a/sp ace" "b/sp ace"\n')).toEqual(['sp ace']);
    expect(headerPaths('--- name-without-folder\n+++ \n')).toEqual(['name-without-folder']);
  });
});

describe('patchProblem', () => {
  it('lets a patch touch the patch paths and nothing else', () => {
    expect(patchProblem(['.husky/pre-push', '.husky/_/h'], HUSKY)).toBeUndefined();
    expect(patchProblem(['./.husky/pre-push', '.HUSKY\\pre-commit'], HUSKY)).toBeUndefined();
    expect(patchProblem(['.husky/pre-push', 'src/app.ts'], HUSKY)).toBe(
      'it touches src/app.ts, outside laws.patch_paths (.husky/**)',
    );
  });

  it("never reaches git's own folder, outside the plot, or an absolute path, whatever the globs allow", () => {
    expect(patchProblem(['.git/hooks/pre-commit'], ['**'])).toBe(
      "it touches .git/hooks/pre-commit, git's own folder",
    );
    expect(patchProblem(['sub/.GIT/config'], ['**'])).toContain("git's own folder");
    expect(patchProblem(['.husky/../../x'], ['**'])).toBe('it touches .husky/../../x, outside the plot');
    expect(patchProblem(['/etc/passwd'], ['**'])).toContain('an absolute path');
    expect(patchProblem(['C:/x'], ['**'])).toContain('an absolute path');
  });
});
