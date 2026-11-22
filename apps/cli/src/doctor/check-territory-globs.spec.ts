import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, git, gitRepo, printed, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir } from '../../test/cli.ts';

describe('doctor territory globs (AH-16)', () => {
  let dir: TempDir;
  let kingdom: string;
  let repo: string;
  let config: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    repo = await gitRepo(path.join(dir.root, 'demo'));
    await writeFile(path.join(repo, 'tracked file.md'), 'tracked\n');
    git(repo, 'add', '.');
    git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'initial');
    await run(testIo(), 'territory', 'add', repo, '--kingdom', kingdom);
    config = path.join(kingdom, 'territories', 'demo', 'territory.json');
  });
  afterEach(() => dir.remove());

  async function fill(fields: Record<string, unknown>) {
    const current = JSON.parse(await readFile(config, 'utf8')) as Record<string, unknown>;
    await writeFile(config, JSON.stringify({ ...current, ...fields }));
  }

  async function doctor(locale = 'en') {
    const io = testIo();
    const code = await run(io, 'doctor', '--kingdom', kingdom, '--locale', locale);
    const warnings = printed(io)
      .split('\n')
      .filter((line) => line.includes('glob '));
    return { code, warnings };
  }

  it('accepts matching globs in all three lists and ignores forbidden paths', async () => {
    await fill({
      shared_paths: [{ glob: '*.md', merge: 'union' }],
      laws: { read_only_paths: ['tracked file.md'], patch_paths: ['**'], forbidden_paths: ['.env'] },
    });
    expect((await doctor()).warnings).toEqual([]);
  });

  it('warns once per unmatched glob without changing the doctor exit code', async () => {
    const before = await doctor();
    await fill({
      shared_paths: [{ glob: 'docs/nope/**', merge: 'union' }],
      laws: { read_only_paths: ['old.json'], patch_paths: ['.husky/**'], forbidden_paths: ['.env'] },
    });
    expect(await doctor()).toEqual({
      code: before.code,
      warnings: [
        '! Territory demo: glob docs/nope/** matches no tracked file on its default branch.',
        '! Territory demo: glob old.json matches no tracked file on its default branch.',
        '! Territory demo: glob .husky/** matches no tracked file on its default branch.',
      ],
    });
    expect((await doctor('vi')).warnings).toContain(
      '! Lãnh thổ demo: glob docs/nope/** không khớp file đã track nào trên nhánh mặc định.',
    );
  });

  it('uses the default branch rather than HEAD, the index or untracked files', async () => {
    git(repo, 'checkout', '-qb', 'feature');
    git(repo, 'rm', 'tracked file.md');
    await writeFile(path.join(repo, 'feature.md'), 'feature\n');
    git(repo, 'add', '.');
    git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'feature');
    await writeFile(path.join(repo, 'staged.md'), 'staged\n');
    git(repo, 'add', '.');
    await writeFile(path.join(repo, 'untracked.md'), 'untracked\n');
    await fill({
      shared_paths: ['tracked file.md', 'feature.md', 'staged.md', 'untracked.md'].map((glob) => ({
        glob,
        merge: 'union',
      })),
    });
    expect((await doctor()).warnings).toEqual([
      '! Territory demo: glob feature.md matches no tracked file on its default branch.',
      '! Territory demo: glob staged.md matches no tracked file on its default branch.',
      '! Territory demo: glob untracked.md matches no tracked file on its default branch.',
    ]);
  });

  it('treats missing laws and missing lists as empty', async () => {
    expect((await doctor()).warnings).toEqual([]);
    await fill({ laws: {} });
    expect((await doctor()).warnings).toEqual([]);
  });

  it('does not claim globs are stale when the default branch cannot be read', async () => {
    await fill({
      vcs: { type: 'git', default_branch: 'missing' },
      shared_paths: [{ glob: 'nope/**', merge: 'union' }],
    });
    expect((await doctor()).warnings).toEqual([]);
  });
});
