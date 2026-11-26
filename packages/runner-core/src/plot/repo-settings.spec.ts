import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, git, gitRepo, minimalEnv } from '../__fixtures__/git-repo.ts';
import { gitOf } from './git.ts';
import { PLOT_EXCLUDES, ensureLongPaths, withPlotExcludes } from './repo-settings.ts';
import type { Git } from './git.ts';

const block = `# Elvaria: plots, and files runners generate in them (ADR 0012)\n${PLOT_EXCLUDES.join('\n')}\n`;

describe('withPlotExcludes', () => {
  it('appends the header and every line to an empty or missing exclude file', () => {
    expect(withPlotExcludes('')).toBe(block);
  });

  it("keeps the owner's lines and closes an unfinished last line first", () => {
    expect(withPlotExcludes('# git ls-files --others --exclude-from=.git/info/exclude\n*.local')).toBe(
      `# git ls-files --others --exclude-from=.git/info/exclude\n*.local\n${block}`,
    );
  });

  it('adds only what is missing, under the existing header, and nothing when all is there', () => {
    const partial = block.replace('/GEMINI.md\n', '');
    expect(withPlotExcludes(partial)).toBe(`${partial}/GEMINI.md\n`);
    expect(withPlotExcludes(block)).toBeUndefined();
    expect(withPlotExcludes(block.replaceAll('\n', '\r\n'))).toBeUndefined();
  });

  it('anchors every line at the plot root', () => {
    for (const line of PLOT_EXCLUDES) expect(line.startsWith('/')).toBe(true);
  });
});

// (RC-10) On real repos in a folder with spaces: the platform is a parameter, so the Windows path runs everywhere.
describe('ensureLongPaths', () => {
  let temp: TempDir;
  let run: Git;
  beforeAll(async () => {
    temp = await tempDir('repo settings long paths');
    const found = await gitOf(TEST_HOST);
    if (found === undefined) throw new Error('no git on this machine');
    run = found;
  });
  afterAll(() => temp.remove());

  const calls: string[][] = [];
  const counting: Git = (cwd, args) => {
    calls.push([...args]);
    return run(cwd, args);
  };
  const longPaths = (repo: string) =>
    execFileSync('git', ['config', '--local', '--get', 'core.longpaths'], {
      cwd: repo,
      encoding: 'utf8',
      env: minimalEnv(),
    }).trim();

  it('sets it once, then spawns nothing while the repo config stays as git read it', async () => {
    const repo = await gitRepo(path.join(temp.root, 'set once'));
    const commonDir = path.join(repo, '.git');
    calls.length = 0;
    await ensureLongPaths(counting, repo, commonDir, 'win32');
    expect(longPaths(repo)).toBe('true');
    expect(calls).toHaveLength(2);
    await ensureLongPaths(counting, repo, commonDir, 'win32');
    await ensureLongPaths(counting, repo, commonDir, 'win32');
    expect(calls).toHaveLength(3);
  });

  it('sets it again after the owner took it out of the repo config', async () => {
    const repo = await gitRepo(path.join(temp.root, 'owner unset'));
    const commonDir = path.join(repo, '.git');
    await ensureLongPaths(run, repo, commonDir, 'win32');
    await ensureLongPaths(run, repo, commonDir, 'win32');
    git(repo, 'config', '--local', '--unset', 'core.longpaths');
    await ensureLongPaths(run, repo, commonDir, 'win32');
    expect(longPaths(repo)).toBe('true');
  });

  it('runs no git and sets nothing off Windows', async () => {
    const repo = await gitRepo(path.join(temp.root, 'not windows'));
    calls.length = 0;
    await ensureLongPaths(counting, repo, path.join(repo, '.git'), 'darwin');
    expect(calls).toHaveLength(0);
    expect(() => longPaths(repo)).toThrow();
  });
});
