import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, territoryAt } from '../../__fixtures__/git-repo.ts';
import { changedPathsOf } from './changes.ts';
import * as gitModule from '../git.ts';

let temp: TempDir;
let repo = '';
let from = '';
let to = '';
beforeAll(async () => {
  temp = await tempDir('territory changes');
  repo = await gitRepo(path.join(temp.root, 'Source repo'));
  await commitFile(repo, 'old.md', 'rename me\n');
  from = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'mv', 'old.md', 'new.md');
  await commitFile(repo, 'docs/with space.md', 'notes\n');
  await commitFile(repo, 'src/a.ts', 'export const a = 1;\n');
  to = git(repo, 'rev-parse', 'HEAD');
});
afterAll(() => temp.remove());

describe('changedPathsOf', () => {
  it('reads a forge merge after fetching the missing commit, and fails closed when fetch fails', async () => {
    const commands: (readonly string[])[] = [];
    let fetched = false;
    const run = vi.spyOn(gitModule, 'gitOf').mockResolvedValue((_cwd, args) => {
      commands.push(args);
      if (args[0] === 'fetch') {
        fetched = true;
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
      }
      return Promise.resolve(
        fetched
          ? { code: 0, stdout: 'docs/alpha.md\0docs/beta.md\0', stderr: '' }
          : { code: 128, stdout: '', stderr: 'bad object' },
      );
    });
    const request = { territory: territoryAt(repo), host: TEST_HOST, from, to };
    try {
      expect(await changedPathsOf(request)).toEqual(['docs/alpha.md', 'docs/beta.md']);
      expect(commands.map((args) => args[0])).toEqual(['diff', 'fetch', 'diff']);
      expect(commands[1]).toEqual(['fetch', '--quiet', '--no-tags', 'origin', 'main']);
      run.mockResolvedValue(() => Promise.resolve({ code: 128, stdout: '', stderr: 'unreachable' }));
      expect(await changedPathsOf(request)).toBeUndefined();
      run.mockResolvedValue((_cwd, args) =>
        Promise.resolve({ code: args[0] === 'fetch' ? 0 : 128, stdout: '', stderr: '' }),
      );
      expect(await changedPathsOf(request)).toBeUndefined();
    } finally {
      run.mockRestore();
    }
  });

  it('reads the source repo range, preserving spaces and both sides of a rename', async () => {
    const request = { territory: territoryAt(repo), host: TEST_HOST, from, to };
    expect(await changedPathsOf(request)).toEqual(['docs/with space.md', 'new.md', 'old.md', 'src/a.ts']);
    expect(await changedPathsOf({ ...request, to: from })).toEqual([]);
  });

  it('returns undefined for unknown commits, missing git, or a territory without git', async () => {
    const request = { territory: territoryAt(repo), host: TEST_HOST, from, to };
    expect(await changedPathsOf({ ...request, to: 'f'.repeat(40) })).toBeUndefined();
    expect(
      await changedPathsOf({ ...request, territory: territoryAt(repo, { vcs: { type: 'none' } }) }),
    ).toBeUndefined();
    expect(
      await changedPathsOf({ ...request, host: { ...TEST_HOST, resolve: () => Promise.resolve(undefined) } }),
    ).toBeUndefined();
  });
});
