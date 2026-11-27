import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, territoryAt } from '../../__fixtures__/git-repo.ts';
import { changedPathsOf } from './changes.ts';

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
