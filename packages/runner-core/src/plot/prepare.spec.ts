import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from './plot-manager.ts';
import { PLOT_RECORD_FILE } from './plot-record.ts';
import { PLOT_EXCLUDES } from './repo-settings.ts';
import { setupLogOf } from './setup.ts';

let root = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria plot '));
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, { recursive: true, force: true }));

const manager = (fields: Partial<Parameters<typeof createPlotManager>[0]> = {}) =>
  createPlotManager({ kingdom, host: TEST_HOST, ...fields });

describe('prepare on a git territory', () => {
  it('adds a worktree on quest/<id> under a path with spaces, and gives the same plot twice', async () => {
    const repo = await gitRepo(path.join(root, 'Tool - DC1', 'dc1 se team'));
    const territory = territoryAt(repo);
    const quest = { id: questId('a1b2c3') };
    const plots = manager();

    const first = await plots.prepare(quest, territory);
    const second = await plots.prepare(quest, territory);

    expect(first).toMatchObject({ ok: true, value: { created: true, setup: null } });
    expect(second).toMatchObject({ ok: true, value: { created: false, setup: null } });
    if (!first.ok || !second.ok) return;
    expect(second.value.plot).toEqual(first.value.plot);
    expect(first.value.plot).toEqual({
      type: 'worktree',
      path: `${territory.path}/.elvaria/worktrees/${quest.id}`,
      branch: `quest/${quest.id}`,
    });
    const worktree = fromPortable(first.value.plot.path!);
    expect(git(worktree, 'symbolic-ref', '--short', 'HEAD')).toBe(`quest/${quest.id}`);
    expect(git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(2);
    // The main checkout stays as the owner left it: the plot is excluded, not untracked.
    expect(git(repo, 'status', '--porcelain')).toBe('');
    // --no-track: the quest branch has no upstream that a bare `git push` could follow to main.
    expect(() => git(worktree, 'config', '--get', `branch.quest/${quest.id}.merge`)).toThrow();
  }, 30_000);

  it('writes the excludes once, keeps what the owner had, and records the fork point', async () => {
    const repo = await gitRepo(path.join(root, 'excludes'));
    const exclude = path.join(repo, '.git', 'info', 'exclude');
    await writeFile(exclude, '# mine\n*.local');
    const plots = manager();
    const quest = { id: questId('b2c3d4') };
    const prepared = await plots.prepare(quest, territoryAt(repo));
    await plots.prepare({ id: questId('c3d4e5') }, territoryAt(repo));

    const text = await readFile(exclude, 'utf8');
    expect(text.startsWith('# mine\n*.local\n')).toBe(true);
    for (const line of PLOT_EXCLUDES)
      expect(text.split('\n').filter((entry) => entry === line)).toHaveLength(1);
    if (!prepared.ok) throw new Error('prepare failed');
    const gitDir = git(
      fromPortable(prepared.value.plot.path!),
      'rev-parse',
      '--path-format=absolute',
      '--git-dir',
    );
    const record: unknown = JSON.parse(await readFile(path.join(gitDir, PLOT_RECORD_FILE), 'utf8'));
    expect(record).toEqual({ version: 1, base: git(repo, 'rev-parse', 'main'), setup_done: false });
  }, 30_000);

  it('sets core.longpaths in the repo on Windows, and nowhere else', async () => {
    const windows = await gitRepo(path.join(root, 'long paths'));
    const posix = await gitRepo(path.join(root, 'short paths'));
    await manager({ platform: 'win32' }).prepare({ id: questId('d4e5f6') }, territoryAt(windows));
    await manager({ platform: 'darwin' }).prepare({ id: questId('d4e5f6') }, territoryAt(posix));

    expect(git(windows, 'config', '--local', '--get', 'core.longpaths')).toBe('true');
    expect(() => git(posix, 'config', '--local', '--get', 'core.longpaths')).toThrow();
  }, 30_000);

  it('runs commands.setup once, in the worktree, with its log in the kingdom', async () => {
    const repo = await gitRepo(path.join(root, 'with setup'));
    await commitFile(
      repo,
      'setup.mjs',
      "import { appendFileSync } from 'node:fs';\nappendFileSync('setup-ran.txt', 'x');\n",
    );
    await commitFile(repo, '.gitignore', 'node_modules/\nsetup-ran.txt\n');
    const territory = territoryAt(repo, { commands: { setup: 'node setup.mjs' } });
    const quest = { id: questId('e5f6g7') };
    const plots = manager();

    const first = await plots.prepare(quest, territory);
    const second = await plots.prepare(quest, territory);

    expect(first).toMatchObject({
      ok: true,
      value: { setup: { exit_code: 0, log_path: setupLogOf(quest.id) } },
    });
    expect(second).toMatchObject({ ok: true, value: { setup: null } });
    if (!first.ok) return;
    expect(await readFile(path.join(fromPortable(first.value.plot.path!), 'setup-ran.txt'), 'utf8')).toBe(
      'x',
    );
    expect(await readFile(path.join(kingdom, setupLogOf(quest.id)), 'utf8')).toContain('$ node setup.mjs');
  }, 30_000);

  it('reports a failed setup and runs it again on the next prepare', async () => {
    const repo = await gitRepo(path.join(root, 'failing setup'));
    await commitFile(
      repo,
      'setup.mjs',
      "import { existsSync } from 'node:fs';\nprocess.exit(existsSync('ready') ? 0 : 3);\n",
    );
    const territory = territoryAt(repo, { commands: { setup: 'node setup.mjs' } });
    const quest = { id: questId('f6g7h8') };
    const plots = manager();

    const failed = await plots.prepare(quest, territory);
    expect(failed).toEqual({
      ok: false,
      error: {
        reason: 'setup_failed',
        detail: 'node setup.mjs: ended with 3',
        log_path: setupLogOf(quest.id),
      },
    });
    await writeFile(path.join(repo, '.elvaria', 'worktrees', quest.id, 'ready'), '');
    expect(await plots.prepare(quest, territory)).toMatchObject({
      ok: true,
      value: { created: false, setup: { exit_code: 0 } },
    });
  }, 30_000);

  it("gives commands.setup the quest's secrets and masks their values in its log (P1-30)", async () => {
    const repo = await gitRepo(path.join(root, 'private registry'));
    // An install from a private registry: it needs the token, and a careless one prints it.
    await commitFile(
      repo,
      'setup.mjs',
      'if (!process.env.NPM_TOKEN) process.exit(4);\nconsole.log(`login ${process.env.NPM_TOKEN}`);\n',
    );
    const territory = territoryAt(repo, { commands: { setup: 'node setup.mjs' } });
    const quest = { id: questId('h8j9k1') };
    const plots = manager();
    // No pattern knows this shape: only the value the setup was given can mask it.
    const value = ['plain', '-FAKE-', 'registry-30'].join('');

    // Without the secret the host's minimal env has no token, so the setup fails as it did before P1-30.
    expect(await plots.prepare(quest, territory)).toMatchObject({
      ok: false,
      error: { reason: 'setup_failed', detail: 'node setup.mjs: ended with 4' },
    });
    const given = await plots.prepare(quest, territory, { npm_token: value });

    expect(given).toMatchObject({ ok: true, value: { setup: { exit_code: 0 } } });
    const log = await readFile(path.join(kingdom, setupLogOf(quest.id)), 'utf8');
    expect(log).toContain('login [redacted]');
    expect(log.split(value)).toHaveLength(1);
  }, 30_000);

  it('refuses a plot path that holds something else, and a territory that is not a repo', async () => {
    const repo = await gitRepo(path.join(root, 'taken'));
    const quest = { id: questId('g7h8j9') };
    await mkdir(path.join(repo, '.elvaria', 'worktrees', quest.id), { recursive: true });
    await writeFile(path.join(repo, '.elvaria', 'worktrees', quest.id, 'notes.txt'), 'mine');
    const folder = path.join(root, 'plain folder');
    await mkdir(folder);

    expect(await manager().prepare(quest, territoryAt(repo))).toMatchObject({
      ok: false,
      error: { reason: 'path_taken' },
    });
    expect(await manager().prepare(quest, territoryAt(folder))).toMatchObject({
      ok: false,
      error: { reason: 'not_a_repo' },
    });
  }, 30_000);

  it('says git is missing when the host cannot find it', async () => {
    const repo = await gitRepo(path.join(root, 'no git'));
    const host = { ...TEST_HOST, resolve: () => Promise.resolve(undefined) };
    expect(await manager({ host }).prepare({ id: questId('h8j9k0') }, territoryAt(repo))).toEqual({
      ok: false,
      error: { reason: 'git_missing', detail: 'git is not found' },
    });
  });

  it('ignores a GIT_DIR in the env it is given: the plot lands in the territory, not in that repo', async () => {
    const repo = await gitRepo(path.join(root, 'territory repo'));
    const elsewhere = await gitRepo(path.join(root, 'pushed repo'));
    const host = { ...TEST_HOST, env: { ...TEST_HOST.env, GIT_DIR: path.join(elsewhere, '.git') } };
    const prepared = await manager({ host }).prepare({ id: questId('j9k0m1') }, territoryAt(repo));

    expect(prepared.ok).toBe(true);
    expect(git(repo, 'branch', '--list', 'quest/*')).toContain('quest/q_20261107_j9k0m1');
    expect(git(elsewhere, 'branch', '--list', 'quest/*')).toBe('');
  }, 30_000);
});

describe('prepare on a territory without git', () => {
  it('makes quests/<id>/work in the kingdom, once', async () => {
    const territory = territoryAt(path.join(root, 'notes'), { kind: 'docs', vcs: { type: 'none' } });
    const quest = { id: questId('k0m1n2') };
    const plots = manager();

    const first = await plots.prepare(quest, territory);
    const second = await plots.prepare(quest, territory);

    const plot = { type: 'folder', path: `quests/${quest.id}/work` };
    expect(first).toEqual({ ok: true, value: { plot, created: true, setup: null } });
    expect(second).toEqual({ ok: true, value: { plot, created: false, setup: null } });
  });
});
