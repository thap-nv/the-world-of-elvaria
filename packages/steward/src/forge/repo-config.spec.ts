// SEC-02b: reading repo config must refuse executable settings without running their values.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { childEnv, git, gitRepoWith } from '../__fixtures__/git-plots.ts';
import { repoConfigFailure } from './repo-config.ts';

const KEYS = [
  'filter.test.clean',
  'filter.test.smudge',
  'filter.test.process',
  'diff.test.textconv',
  'merge.test.driver',
  'gpg.program',
  'remote.origin.receivepack',
  'remote.origin.uploadpack',
  'core.gitproxy',
  'protocol.test.allow',
  'url.test.insteadof',
];
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;

describe('delivery repo config', () => {
  let root: string;
  let repo: string;
  let marker: string;
  let program: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'elvaria repo config '));
    repo = await gitRepoWith(path.join(root, 'repo'), { 'README.md': '# demo\n' });
    marker = path.join(root, 'ran');
    const script = path.join(root, 'mark.mjs');
    await writeFile(
      script,
      "import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[2], 'ran');\n",
    );
    program = [process.execPath, script, marker].map((file) => `"${file.replaceAll('\\', '/')}"`).join(' ');
  });
  afterEach(async () => rm(root, RM));

  const check = (cwd = repo, env = childEnv()) =>
    repoConfigFailure(
      { launch: { file: 'git', args: [] }, env },
      cwd,
      'quest/example',
      new AbortController().signal,
    );

  it.each(KEYS)('refuses local %s without executing or disclosing its value', async (key) => {
    git(repo, 'config', '--local', key, program);
    if (key === 'gpg.program') git(repo, 'config', 'commit.gpgSign', 'true');
    expect(await check()).toEqual({
      stage: 'push',
      reason: 'push_refused',
      branch: 'quest/example',
      detail: `repo config refused: ${key}`,
    });
    expect(await readFile(marker, 'utf8').catch(() => '')).toBe('');
  });

  it('refuses worktree settings in a linked worktree', async () => {
    const plot = path.join(root, 'linked plot');
    git(repo, 'config', 'extensions.worktreeConfig', 'true');
    git(repo, 'worktree', 'add', '--detach', plot, 'HEAD');
    git(plot, 'config', '--worktree', 'filter.test.process', program);
    expect(await check(plot)).toMatchObject({ detail: 'repo config refused: filter.test.process' });
    expect(await readFile(marker, 'utf8').catch(() => '')).toBe('');
  });

  it('allows the same keys from the owner global config', async () => {
    const config = path.join(root, 'owner.config');
    for (const key of KEYS) git(repo, 'config', '--file', config, key, program);
    git(repo, 'config', '--file', config, 'commit.gpgSign', 'true');
    expect(await check(repo, { ...childEnv(), GIT_CONFIG_GLOBAL: config })).toBeUndefined();
    expect(await readFile(marker, 'utf8').catch(() => '')).toBe('');
  });

  it.each(['false', 'no', 'off', '0', ''])('allows gpg.program with signing disabled (%s)', async (value) => {
    git(repo, 'config', 'gpg.program', program);
    git(repo, 'config', 'commit.gpgSign', value);
    expect(await check()).toBeUndefined();
  });

  it('allows gpg.program when signing is absent and reports every other key once', async () => {
    git(repo, 'config', 'gpg.program', program);
    expect(await check()).toBeUndefined();
    git(repo, 'config', '--add', 'filter.test.clean', program);
    git(repo, 'config', '--add', 'filter.test.clean', 'another value');
    git(repo, 'config', 'remote.origin.uploadpack', program);
    expect(await check()).toMatchObject({
      detail: 'repo config refused: filter.test.clean, remote.origin.uploadpack',
    });
  });

  it('fails closed when config cannot be read without including its output', async () => {
    await writeFile(path.join(repo, '.git', 'config'), 'invalid config containing private data\n');
    expect(await check()).toMatchObject({
      stage: 'push',
      reason: 'push_refused',
      detail: 'cannot read repo config',
    });
  });
});
