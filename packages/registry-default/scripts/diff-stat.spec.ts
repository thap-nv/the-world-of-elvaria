import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { UsageError } from './common.mjs';
import { parseNumstat, run } from './diff-stat.mjs';
import { makePlot, minimalEnv, runScript } from './test-plot.ts';
import type { Plot } from './test-plot.ts';

let plot: Plot | undefined;
afterEach(() => plot?.remove());

/** A throwaway repo: `main` with two files, then a `quest` branch that changes, deletes and adds some. */
function questRepo(): Plot {
  const repo = makePlot({ 'a.txt': 'one\ntwo\n', 'b.txt': 'x\n', '.gitconfig-empty': '' });
  // Hermetic: neither the machine's global nor its system git config (signing, autocrlf) leaks in.
  const env = {
    ...minimalEnv(),
    GIT_CONFIG_GLOBAL: path.join(repo.dir, '.gitconfig-empty'),
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const git = (...args: string[]) => {
    const identity = ['-c', 'user.name=Elvaria Test', '-c', 'user.email=test@elvaria.invalid'];
    const result = spawnSync('git', [...identity, ...args], { cwd: repo.dir, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  };
  git('init', '-q', '-b', 'main');
  git('add', 'a.txt', 'b.txt');
  git('commit', '-q', '-m', 'base');
  git('switch', '-q', '-c', 'quest');
  repo.write('a.txt', 'one\ntwo\nthree\n');
  repo.write('my file.txt', 'spaced\n');
  repo.write('bin.dat', new Uint8Array([0, 1, 2, 0, 255]));
  git('rm', '-q', 'b.txt');
  git('add', 'a.txt', 'my file.txt', 'bin.dat');
  git('commit', '-q', '-m', 'quest work');
  return repo;
}

describe('parseNumstat', () => {
  it('reads counts, binary markers and paths with tabs or spaces', () => {
    expect(parseNumstat('3\t1\ta.txt\0-\t-\tlogo.png\x000\t2\tdir/with\ttab.md\0\0garbage\0')).toEqual([
      { path: 'a.txt', added: 3, deleted: 1, binary: false },
      { path: 'logo.png', added: 0, deleted: 0, binary: true },
      { path: 'dir/with\ttab.md', added: 0, deleted: 2, binary: false },
    ]);
  });
});

describe('diff-stat', () => {
  it('reports what the branch changed since it left base', () => {
    plot = questRepo();
    expect(run({ base: 'main' }, {}, plot.dir)).toEqual({
      summary: '4 files changed, 2 insertions(+), 1 deletions(-)',
      data: {
        base: 'main',
        head: 'HEAD',
        files_changed: 4,
        insertions: 2,
        deletions: 1,
        files: [
          { path: 'a.txt', added: 1, deleted: 0, binary: false },
          { path: 'b.txt', added: 0, deleted: 1, binary: false },
          { path: 'bin.dat', added: 0, deleted: 0, binary: true },
          { path: 'my file.txt', added: 1, deleted: 0, binary: false },
        ],
      },
    });
  });

  it.each(['--output=/tmp/x', 'main..evil', 'main HEAD', ''])(
    'refuses %j as a ref, since a model writes params',
    (ref) => {
      expect(() => run({ base: ref }, {}, '.')).toThrow(UsageError);
    },
  );

  it('breaks with git’s reason for a ref the repo does not have', () => {
    plot = questRepo();
    expect(() => run({ base: 'no-such-branch' }, {}, plot?.dir ?? '')).toThrow(/git diff failed/);
  });

  it('runs as a process', () => {
    plot = questRepo();
    const result = runScript('diff-stat.mjs', ['--params', '{"base":"main","head":"quest"}'], plot.dir);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ data: { head: 'quest', files_changed: 4 } });
  });
});
