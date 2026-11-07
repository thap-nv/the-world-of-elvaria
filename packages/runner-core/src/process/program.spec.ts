import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST } from '../__fixtures__/git-repo.ts';
import { goneWithin, treeScript } from '../__fixtures__/tree.ts';
import { childEnvOf, runProgram } from './program.ts';

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'elvaria program '));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('childEnvOf', () => {
  it('drops every GIT_* variable, whatever its case, and keeps the rest', () => {
    expect(childEnvOf({ PATH: '/bin', GIT_DIR: '/x/.git', git_index_file: 'i', HOME: '/h' })).toEqual({
      PATH: '/bin',
      HOME: '/h',
    });
  });
});

describe('runProgram', () => {
  const node = (code: string) => [process.execPath, '-e', code];
  const options = { cwd: '', env: TEST_HOST.env, timeout_ms: 10_000 };

  it('captures output and the exit code, in the folder it is given', async () => {
    const run = await runProgram(node('console.log(process.cwd()); console.error("warn"); process.exit(4)'), {
      ...options,
      cwd: dir,
    });
    expect(run).toMatchObject({ exit_code: 4, timed_out: false, stderr: 'warn\n' });
    // The child prints the real path: on macOS the temp folder is a link (/var → /private/var).
    expect(await realpath(run.stdout.trim())).toBe(await realpath(dir));
  });

  it('passes only the env it is given, without GIT_*', async () => {
    const run = await runProgram(
      node('console.log(JSON.stringify([process.env.GIT_DIR ?? null, process.env.ELVARIA_SEEN ?? null]))'),
      { ...options, cwd: dir, env: { ...TEST_HOST.env, GIT_DIR: '/elsewhere/.git', ELVARIA_SEEN: 'yes' } },
    );
    expect(JSON.parse(run.stdout)).toEqual([null, 'yes']);
  });

  it('stops a program at its timeout', async () => {
    const run = await runProgram(node('setInterval(() => {}, 1000)'), {
      ...options,
      cwd: dir,
      timeout_ms: 300,
    });
    expect(run).toMatchObject({ exit_code: null, timed_out: true });
    expect(run.duration_ms).toBeGreaterThanOrEqual(250);
  });

  it('takes the whole process tree down at its timeout (P1-06)', async () => {
    const run = await runProgram(node(treeScript()), { ...options, cwd: dir, timeout_ms: 1500 });
    expect(run.timed_out).toBe(true);
    const grandchild = Number(run.stdout.trim());
    expect(grandchild).toBeGreaterThan(0);
    expect(await goneWithin(grandchild)).toBe(true);
  });

  it('reports a program that cannot start', async () => {
    const run = await runProgram([path.join(dir, 'no such program')], { ...options, cwd: dir });
    expect(run.exit_code).toBeNull();
    expect(run.start_error).toMatch(/ENOENT/);
  });
});
