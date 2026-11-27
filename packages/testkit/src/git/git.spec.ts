import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tempDir } from '../temp/temp-dir.ts';
import { commitFiles, envWithoutGit, git, gitRepo } from './git.ts';
import type { TempDir } from '../temp/temp-dir.ts';

let dir: TempDir;
beforeEach(async () => {
  dir = await tempDir('git');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await dir.remove();
});

describe('envWithoutGit', () => {
  it("drops git's variables in any case and keeps the rest", () => {
    const env = { PATH: '/bin', GIT_DIR: '/x/.git', git_work_tree: '/x', HOME: '/h', EMPTY: undefined };
    expect(envWithoutGit(env)).toEqual({ PATH: '/bin', HOME: '/h' });
  });
});

describe('gitRepo and commitFiles', () => {
  it('makes a repo on main whose first commit holds the files, byte for byte', async () => {
    const repo = await gitRepo(path.join(dir.root, 'my repo'), {
      'a.txt': 'one\r\ntwo\n',
      'd e/f.md': '# f\n',
    });
    expect(git(repo, 'branch', '--show-current')).toBe('main');
    expect(git(repo, 'rev-list', '--count', 'HEAD')).toBe('1');
    expect(git(repo, 'log', '-1', '--format=%an <%ae> %s')).toBe('Elvaria Test <test@elvaria.invalid> first');
    expect(git(repo, 'ls-files').split('\n')).toEqual(['a.txt', 'd e/f.md']);
    expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('one\r\ntwo\n');
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('starts with a README when given no files', async () => {
    const repo = await gitRepo(path.join(dir.root, 'plain'));
    expect(git(repo, 'show', 'HEAD:README.md')).toBe('# demo');
  });

  it('commits more files on top and returns the new sha', async () => {
    const repo = await gitRepo(path.join(dir.root, 'repo'));
    const sha = await commitFiles(repo, { 'src/deep/x.ts': 'export {};\n' }, 'add x');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(git(repo, 'log', '-1', '--format=%H %s')).toBe(`${sha} add x`);
    expect(git(repo, 'rev-list', '--count', 'HEAD')).toBe('2');
  });

  // Makes two repos and runs ~20 git processes: ~1 s alone, 6979 ms (past the 5 s default) when every package's tests
  // run at once on a loaded machine (q_20261126_88mhg2-2 test.log). 20 s leaves ~3x over that, ~20x over the quiet run.
  it(
    "never touches the repo the caller's GIT_DIR names, as in husky's pre-push (implementation-plan §6)",
    { timeout: 20_000 },
    async () => {
      const outside = await gitRepo(path.join(dir.root, 'outside'));
      const before = git(outside, 'rev-parse', 'HEAD');
      vi.stubEnv('GIT_DIR', path.join(outside, '.git'));
      vi.stubEnv('GIT_WORK_TREE', outside);
      const repo = await gitRepo(path.join(dir.root, 'inside'), { 'in.txt': 'in\n' });
      await commitFiles(repo, { 'more.txt': 'more\n' });
      vi.unstubAllEnvs();
      expect(git(outside, 'rev-parse', 'HEAD')).toBe(before);
      expect(git(outside, 'config', '--get', 'core.bare')).toBe('false');
      expect(git(repo, 'rev-list', '--count', 'HEAD')).toBe('2');
    },
  );

  it('throws when git fails', () => {
    expect(() => git(dir.root, 'no-such-command')).toThrow();
  });
});
