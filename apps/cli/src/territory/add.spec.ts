import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { TerritorySchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baseEnv,
  foundKingdom,
  git,
  gitRepo,
  pathWithoutGit,
  printed,
  run,
  tempDir,
  testIo,
} from '../../test/cli.ts';
import { slugOf } from './add.ts';
import { withoutCredentials } from './git-info.ts';
import type { TempDir } from '../../test/cli.ts';

describe('slugOf', () => {
  it.each([
    ['dc1-se-team', 'dc1-se-team'],
    ['Tool - DC1', 'tool-dc1'],
    ['Đồ án Tốt nghiệp', 'do-an-tot-nghiep'],
    ['--x--', 'x'],
    ['a'.repeat(40), 'a'.repeat(32)],
  ])('%s → %s', (name, slug) => {
    expect(slugOf(name)).toBe(slug);
  });
});

describe('withoutCredentials', () => {
  it('drops user and token from http(s) remotes and keeps ssh users', () => {
    expect(withoutCredentials('https://owner:ghp_secret@github.com/a/b.git')).toBe(
      'https://github.com/a/b.git',
    );
    expect(withoutCredentials('http://token@host/x')).toBe('http://host/x');
    expect(withoutCredentials('git@github.com:a/b.git')).toBe('git@github.com:a/b.git');
    expect(withoutCredentials('https://github.com/a/b.git')).toBe('https://github.com/a/b.git');
  });
});

describe('elvaria territory add', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const readTerritory = async (id: string) =>
    TerritorySchema.parse(
      JSON.parse(await readFile(path.join(kingdom, 'territories', id, 'territory.json'), 'utf8')),
    );
  const add = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'territory', 'add', ...args, '--kingdom', kingdom, '--locale', 'en');

  it('attaches a git repo: id from the folder, default branch, remote without its token', async () => {
    const repo = await gitRepo(path.join(dir.root, 'Đồ án'));
    git(repo, 'remote', 'add', 'origin', 'https://owner:ghp_secret@github.com/owner/do-an.git');
    const io = testIo();
    expect(await add(io, repo)).toBe(0);
    const territory = await readTerritory('do-an');
    expect(territory).toMatchObject({
      id: 'do-an',
      name: 'Đồ án',
      kind: 'code',
      path: repo.replaceAll('\\', '/'),
      vcs: { type: 'git', default_branch: 'main', remote: 'https://github.com/owner/do-an.git' },
      worktree_dir: '.elvaria/worktrees',
      max_concurrent: 1,
    });
    expect(printed(io)).toContain('Attached territory «Đồ án» (do-an)');
    expect(printed(io)).toContain('git: default branch main.');
    // git prints the real path; the temp folder may be a link to it (macOS): still the repo's own root.
    expect(printed(io)).not.toContain('inside the git repo');
  });

  it("prefers origin's default branch, and --branch over both", async () => {
    const repo = await gitRepo(path.join(dir.root, 'origin'));
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop');
    expect(await add(testIo(), repo)).toBe(0);
    expect((await readTerritory('origin')).vcs.default_branch).toBe('develop');
    const other = await gitRepo(path.join(dir.root, 'other'));
    expect(
      await add(testIo(), other, '--branch', 'trunk', '--id', 'second', '--name', 'Second', '--kind', 'docs'),
    ).toBe(0);
    expect(await readTerritory('second')).toMatchObject({
      name: 'Second',
      kind: 'docs',
      vcs: { default_branch: 'trunk' },
    });
  });

  it('needs --branch on a detached HEAD without origin', async () => {
    const repo = await gitRepo(path.join(dir.root, 'detached'));
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'first');
    git(repo, 'checkout', '-q', '--detach');
    const io = testIo();
    expect(await add(io, repo)).toBe(1);
    expect(io.printed.err).toEqual([
      'Cannot tell the default branch (detached HEAD, no origin); add --branch <branch>.',
    ]);
  });

  it('notes a folder inside a bigger repo', async () => {
    const repo = await gitRepo(path.join(dir.root, 'mono'));
    const docs = path.join(repo, 'docs');
    await mkdir(docs);
    const io = testIo();
    expect(await add(io, docs)).toBe(0);
    expect(printed(io)).toContain('Note: the folder is inside the git repo');
  });

  it('attaches a plain folder as vcs none, also when git is missing', async () => {
    const folder = path.join(dir.root, 'notes');
    await mkdir(folder);
    expect(await add(testIo({ env: { PATH: pathWithoutGit() } }), folder)).toBe(0);
    expect((await readTerritory('notes')).vcs).toEqual({ type: 'none' });
  });

  it('refuses a git folder when git cannot be found', async () => {
    const folder = path.join(dir.root, 'repo');
    await mkdir(path.join(folder, '.git'), { recursive: true });
    const io = testIo({ env: { PATH: pathWithoutGit() } });
    expect(await add(io, folder)).toBe(1);
    expect(io.printed.err).toEqual(['The folder has .git but git was not found on PATH.']);
  });

  it('refuses a missing folder, a taken id or folder, and bad names', async () => {
    const missing = testIo();
    expect(await add(missing, path.join(dir.root, 'nowhere'))).toBe(1);
    expect(missing.printed.err[0]).toContain('There is no folder');
    const repo = await gitRepo(path.join(dir.root, 'repo'));
    expect(await add(testIo(), repo)).toBe(0);
    const again = testIo();
    expect(await add(again, repo, '--id', 'repo-2')).toBe(1);
    expect(again.printed.err).toEqual(['This folder is already territory repo.']);
    const taken = testIo();
    expect(await add(taken, await gitRepo(path.join(dir.root, 'x', 'repo')))).toBe(1);
    expect(taken.printed.err).toEqual(['Territory repo already exists; choose another id with --id.']);
    const bad = testIo();
    const folder = path.join(dir.root, 'global');
    await mkdir(folder);
    expect(await add(bad, folder, '--name', 'n'.repeat(25), '--kind', 'web')).toBe(1);
    expect(bad.printed.err).toEqual([
      'Territory id «global» is not valid: lowercase letters, digits and hyphens, up to 32 characters, not global; set one with --id.',
      'A name has 1 to 24 characters.',
      '--kind takes one of: code, docs, content, data, mixed.',
    ]);
  });

  it('lists territories, and a file it cannot read', async () => {
    const empty = testIo();
    expect(await run(empty, 'territory', 'list', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(empty.printed.out).toEqual(['No territories yet. Add one with: elvaria territory add <folder>']);
    await add(testIo(), await gitRepo(path.join(dir.root, 'repo')));
    await mkdir(path.join(kingdom, 'territories', 'broken'));
    await writeFile(path.join(kingdom, 'territories', 'broken', 'territory.json'), '{');
    const io = testIo();
    expect(await run(io, 'territory', 'list', '--kingdom', kingdom, '--locale', 'en')).toBe(1);
    expect(io.printed.out[0]).toMatch(/^ID\s+Name\s+Kind\s+Branch\s+Path$/);
    expect(io.printed.out[1]).toMatch(/^repo\s+repo\s+code\s+main\s+/);
    expect(io.printed.err).toEqual(['territories/broken/territory.json is not valid JSON.']);
  });
});

describe('inside a git hook, where git has exported GIT_DIR (the pre-push hook runs these specs)', () => {
  let dir: TempDir;
  let saved: string | undefined;
  beforeEach(async () => {
    dir = await tempDir();
    saved = process.env.GIT_DIR;
  });
  afterEach(async () => {
    if (saved === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = saved;
    await dir.remove();
  });

  it("never touches the hook's repo: fixtures and the CLI work in their own folder", async () => {
    const outer = await gitRepo(path.join(dir.root, 'outer'));
    process.env.GIT_DIR = path.join(outer, '.git');
    const kingdom = await foundKingdom(dir.root);
    const repo = await gitRepo(path.join(dir.root, 'inner'));
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'inner');
    const io = testIo({ env: { ...baseEnv(), GIT_DIR: process.env.GIT_DIR } });
    expect(await run(io, 'territory', 'add', repo, '--kingdom', kingdom)).toBe(0);
    expect(printed(io)).not.toContain('inside the git repo');
    expect(git(outer, 'rev-list', '--all')).toBe('');
    expect(git(outer, 'config', 'core.bare')).toBe('false');
    expect(git(repo, 'log', '--format=%s')).toBe('inner');
  });
});
