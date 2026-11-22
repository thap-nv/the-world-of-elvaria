// Reading a forge credential (PS-08, ADR 0023) against a fake helper: one there, none (no hang: git exits rather
// than prompt), one that never answers (stopped at the limit), no git at all, and (SEC-02) a territory whose own
// config names a helper that never runs. The token is only ever compared, never printed by an assertion, so a
// failing spec cannot leak it either.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, gitRepo, isolatedPath, pathWithoutGit, tempDir, testIo } from '../../test/cli.ts';
import {
  FAKE_TOKEN,
  FAKE_USER,
  GITHUB_REMOTE,
  poisonRepo,
  poisonRuns,
  useFakeHelper,
} from '../../test/credential.ts';
import { deliveryGitEnv, readCredential } from './credential.ts';
import { forgeRepoOf } from './remote.ts';
import type { TempDir } from '../../test/cli.ts';

const REPO = forgeRepoOf(GITHUB_REMOTE, 'github')!;
/** Long enough for git and Node to start on a busy Windows machine, short enough for a spec. */
const SHORT_LIMIT_MS = 4000;

describe('readCredential', () => {
  let dir: TempDir;
  let repo: string;
  let home: string;
  beforeEach(async () => {
    dir = await tempDir();
    repo = await gitRepo(path.join(dir.root, 'lãnh thổ'));
    // An empty home: the machine's ~/.gitconfig names no helper here.
    home = path.join(dir.root, 'home');
    await mkdir(home);
  });
  afterEach(() => dir.remove());

  const ioWith = async (pathValue?: string) =>
    testIo({ env: { ...baseEnv(pathValue ?? (await isolatedPath())), HOME: home, USERPROFILE: home } });

  it('gives the stored credential, asking for the https one of the forge host', async () => {
    const asked = await useFakeHelper(home, dir.root, 'token');
    const read = await readCredential(await ioWith(), repo, REPO);
    expect(read.ok).toBe(true);
    expect(read.ok && read.value.password === FAKE_TOKEN).toBe(true);
    expect(read.ok && read.value.username).toBe(FAKE_USER);
    const question = await readFile(asked, 'utf8');
    expect(question).toContain('protocol=https');
    expect(question).toContain('host=github.com');
  });

  it('says none when git has nothing, at once instead of prompting', async () => {
    await useFakeHelper(home, dir.root, 'nothing');
    const started = Date.now();
    expect(await readCredential(await ioWith(), repo, REPO, SHORT_LIMIT_MS * 2)).toEqual({
      ok: false,
      error: 'none',
    });
    expect(Date.now() - started).toBeLessThan(SHORT_LIMIT_MS * 2);
  });

  it('stops a helper that never answers at the limit, with its process tree', async () => {
    await useFakeHelper(home, dir.root, 'hang');
    expect(await readCredential(await ioWith(), repo, REPO, SHORT_LIMIT_MS)).toEqual({
      ok: false,
      error: 'timeout',
    });
  });

  it("runs no helper the territory's own config names, asking the owner's alone (SEC-02)", async () => {
    const asked = await useFakeHelper(home, dir.root, 'nothing');
    const marker = await poisonRepo(repo, dir.root);
    const io = await ioWith();
    expect(await readCredential(io, repo, REPO)).toEqual({ ok: false, error: 'none' });
    expect(await readFile(asked, 'utf8')).toContain('host=github.com');
    expect(await poisonRuns(marker)).toEqual([]);
    // The same question without Elvaria's switches: the owner's helper has nothing, so git asks the territory's.
    spawnSync('git', ['credential', 'fill'], {
      cwd: repo,
      env: deliveryGitEnv(io),
      input: 'protocol=https\nhost=github.com\n\n',
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    expect(await poisonRuns(marker)).toEqual(['helper get']);
  });

  it('says no_git without git on PATH', async () => {
    expect(await readCredential(await ioWith(pathWithoutGit()), repo, REPO)).toEqual({
      ok: false,
      error: 'no_git',
    });
  });

  it('says no_git when the territory folder is gone, since git cannot start there', async () => {
    const gone = path.join(dir.root, 'gone');
    expect(await readCredential(await ioWith(), gone, REPO)).toEqual({ ok: false, error: 'no_git' });
  });
});

describe('deliveryGitEnv', () => {
  it('sets GIT_TERMINAL_PROMPT=0 as its one GIT_* variable, whatever the caller has ((L) of the PS-08 plan)', () => {
    const io = testIo({
      env: { ...baseEnv(), GIT_DIR: '/elsewhere', GIT_ASKPASS: 'askpass', GH_TOKEN: 'x' },
    });
    const env = deliveryGitEnv(io);
    expect(Object.keys(env).filter((name) => /^GIT_/i.test(name))).toEqual(['GIT_TERMINAL_PROMPT']);
    expect(env).toMatchObject({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' });
    expect(env).not.toHaveProperty('GH_TOKEN');
  });
});
