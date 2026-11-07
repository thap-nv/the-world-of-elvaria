import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST } from '../__fixtures__/git-repo.ts';
import { argvOf, childEnvOf, runProgram } from './program.ts';
import type { ProgramResolver } from './program.ts';

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'elvaria program '));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

/** pnpm as a Windows shim becomes `node <script>` in the composition root; here that is a table. */
const resolver: ProgramResolver = (name) =>
  Promise.resolve(
    name === 'pnpm'
      ? { file: 'C:/Program Files/nodejs/node.exe', args: ['C:/pnpm/bin/pnpm.cjs'] }
      : undefined,
  );

describe('argvOf', () => {
  it("puts the resolved program's launch before the command's own arguments", async () => {
    expect(await argvOf('pnpm -r test', resolver)).toEqual({
      ok: true,
      value: ['C:/Program Files/nodejs/node.exe', 'C:/pnpm/bin/pnpm.cjs', '-r', 'test'],
    });
  });

  it('says why a command cannot run', async () => {
    expect(await argvOf('pnpm lint && pnpm test', resolver)).toEqual({
      ok: false,
      error: { reason: 'shell_syntax', detail: 'pnpm lint && pnpm test' },
    });
    expect(await argvOf('docker compose up', resolver)).toEqual({
      ok: false,
      error: { reason: 'not_found', detail: 'docker' },
    });
  });
});

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

  it('reports a program that cannot start', async () => {
    const run = await runProgram([path.join(dir, 'no such program')], { ...options, cwd: dir });
    expect(run.exit_code).toBeNull();
    expect(run.start_error).toMatch(/ENOENT/);
  });
});
