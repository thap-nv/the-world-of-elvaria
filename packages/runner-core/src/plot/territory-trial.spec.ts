// The territory's trial (PS-25) on a real git repo whose path has spaces: commands.setup then every check on a
// detached worktree at the default branch's head, and nothing left behind but the logs.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, territoryAt } from '../__fixtures__/git-repo.ts';
import { RM_TEMP } from '../__fixtures__/temp.ts';
import { trialIdOf, tryTerritory } from './territory-trial.ts';

const SCRIPTS: Record<string, string> = {
  'setup.mjs': "import { writeFileSync } from 'node:fs';\nwriteFileSync('setup-ran.txt', 'yes');\n",
  'needs-setup.mjs':
    "import { existsSync } from 'node:fs';\nif (!existsSync('setup-ran.txt')) { console.error('Error: no setup'); process.exit(1); }\n",
  'ok.mjs': "console.log('ok');\n",
  'red.mjs':
    "console.log('running 3 tests');\nconsole.error('Error: expected 1 to be 2');\nprocess.exit(1);\n",
  'broken-setup.mjs': "console.log('resolving');\nconsole.error('boom: cannot install');\nprocess.exit(3);\n",
  'docker.mjs':
    "console.error('Cannot connect to the Docker daemon at unix:///var/run/docker.sock');\nprocess.exit(1);\n",
};

let root = '';
let repo = '';
let kingdom = '';
let first = '';
let head = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria territory trial '));
  repo = await gitRepo(path.join(root, 'Tool - Demo'));
  first = git(repo, 'rev-parse', 'HEAD');
  for (const [file, text] of Object.entries(SCRIPTS)) await commitFile(repo, file, text);
  head = git(repo, 'rev-parse', 'HEAD');
  kingdom = path.join(root, 'the kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, RM_TEMP));

const check = (id: string, run: string | string[], fields: Record<string, unknown> = {}) => ({
  id,
  run,
  when: ['**'],
  timeout_minutes: 1,
  ...fields,
});

const trialOf = (fields: Record<string, unknown>, stamp?: string) =>
  tryTerritory({
    kingdom,
    territory: territoryAt(repo, fields),
    host: TEST_HOST,
    ...(stamp === undefined ? {} : { stamp }),
  });

const trialFolder = () => path.join(repo, '.elvaria', 'worktrees', trialIdOf('demo'));

describe('tryTerritory', () => {
  it('runs setup then every check at the head of main, and leaves no plot and no branch', async () => {
    const run = await trialOf({
      commands: { setup: 'node setup.mjs' },
      checks: [check('e2e', 'node ok.mjs', { exclusive: true }), check('unit', 'node needs-setup.mjs')],
    });
    expect(run.trial.base).toBe(head);
    expect(run.trial.setup).toMatchObject({ command: 'node setup.mjs', pass: true, exit_code: 0 });
    // Not exclusive first, as the Steward runs them.
    expect(run.trial.checks.map(({ id, pass, timeout_minutes }) => [id, pass, timeout_minutes])).toEqual([
      ['unit', true, 1],
      ['e2e', true, 1],
    ]);
    expect(run.leftover).toBeUndefined();
    expect(existsSync(trialFolder())).toBe(false);
    expect(git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
    expect(git(repo, 'branch', '--list', '--format=%(refname:short)')).toBe('main');
    expect(existsSync(path.join(kingdom, '.runs', 'trial-demo-setup.log'))).toBe(true);
    expect(existsSync(path.join(kingdom, '.runs', 'trial-demo', 'checks', 'unit.log'))).toBe(true);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it("names a broken setup's command and first error line, and runs no check after it", async () => {
    const run = await trialOf({
      commands: { setup: 'node broken-setup.mjs' },
      checks: [check('unit', 'node ok.mjs')],
    });
    expect(run.trial.setup).toMatchObject({
      command: 'node broken-setup.mjs',
      pass: false,
      exit_code: 3,
      error_line: 'boom: cannot install',
      log_path: '.runs/trial-demo-setup.log',
    });
    expect(run.trial.checks).toEqual([]);
    expect(existsSync(trialFolder())).toBe(false);
  });

  it('names the command of a check that failed at the base, the one of its lines that failed', async () => {
    const run = await trialOf({ checks: [check('lint', ['node ok.mjs', 'node red.mjs'])] });
    expect(run.trial.setup).toBeNull();
    expect(run.trial.checks).toEqual([
      expect.objectContaining({
        id: 'lint',
        pass: false,
        command: 'node red.mjs',
        error_line: 'Error: expected 1 to be 2',
        log_path: '.runs/trial-demo/checks/lint.log',
      }),
    ]);
  });

  it("tells a setup whose environment failed, by the territory's environment_errors", async () => {
    const run = await trialOf({ commands: { setup: 'node docker.mjs' } });
    expect(run.trial.setup?.environment).toContain('Cannot connect to the Docker daemon');
  });

  it("counts the commits since the gazetteer's stamp, null for a stamp git does not know", async () => {
    expect((await trialOf({}, first)).commits_since).toBe(Object.keys(SCRIPTS).length);
    expect((await trialOf({}, 'deadbeefdeadbeef')).commits_since).toBeNull();
    expect('commits_since' in (await trialOf({}))).toBe(false);
  });

  it('removes a trial plot a killed trial left, then tries', async () => {
    git(repo, 'worktree', 'add', '--quiet', '--detach', trialFolder(), 'main');
    const run = await trialOf({ checks: [check('unit', 'node ok.mjs')] });
    expect(run.trial.checks.map(({ pass }) => pass)).toEqual([true]);
    expect(existsSync(trialFolder())).toBe(false);
  });

  it('makes no plot without git, outside a repo, or without the default branch', async () => {
    const none = await trialOf({ vcs: { type: 'none' } });
    expect(none.trial).toMatchObject({ base: null, setup: null, checks: [] });
    expect(none.trial.plot_failure).toContain('no git');
    const outside = await tryTerritory({ kingdom, territory: territoryAt(kingdom), host: TEST_HOST });
    expect(outside.trial.plot_failure).toBeDefined();
    const branchless = await trialOf({ vcs: { type: 'git', default_branch: 'nope' } });
    expect(branchless.trial.plot_failure).toBe('no branch nope');
    const gitless = await tryTerritory({
      kingdom,
      territory: territoryAt(repo),
      host: { ...TEST_HOST, resolve: () => Promise.resolve(undefined) },
    });
    expect(gitless.trial.plot_failure).toBe('git is not found');
  });
});
