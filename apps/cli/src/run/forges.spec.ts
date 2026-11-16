// The forges `elvaria run` gives the Steward (PS-08c): GitHub's adapter and the git found on PATH, or none without git.
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { baseEnv, isolatedPath, pathWithoutGit, testIo } from '../../test/cli.ts';
import { GITHUB_REMOTE } from '../../test/credential.ts';
import { forgesOf } from './forges.ts';

describe('forgesOf', () => {
  it("gives GitHub's adapter and the git of PATH, run as found", async () => {
    const forges = await forgesOf(testIo({ env: baseEnv(await isolatedPath()) }));
    expect(forges?.git.args).toEqual([]);
    expect(path.basename(forges?.git.file ?? '').toLowerCase()).toMatch(/^git(\.exe|\.cmd)?$/);
    expect(forges?.adapters.github?.repoOf(GITHUB_REMOTE, 'C:/x')).toEqual({
      owner: 'elvaria-specs',
      name: 'kingdom-repo',
      cwd: 'C:/x',
    });
  });

  it('gives none without git on PATH', async () => {
    expect(await forgesOf(testIo({ env: baseEnv(pathWithoutGit()) }))).toBeUndefined();
  });
});
