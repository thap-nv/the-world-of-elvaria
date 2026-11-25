// The switches of gitGuard (SEC-02, threat model A5): first for listings written by hand, then on a real repository
// whose own config names programs for fsmonitor, ssh and the credential helper. The plot's git and a credential fill
// run none of them, while the owner's own ssh command and helper (a home's .gitconfig) still run; git without the
// switches, last, runs the repository's, so the case cannot pass on a poison that never worked.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptions } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, git as gitIn, gitRepo, minimalEnv } from '../__fixtures__/git-repo.ts';
import { poisonedGit, runsIn } from '../__fixtures__/poisoned-git.ts';
import { gitOf } from '../plot/git.ts';
import { runToEnd } from './child.ts';
import { gitGuard, gitGuardOf, gitGuards } from './git-guard.ts';
import type { PoisonedGit } from '../__fixtures__/poisoned-git.ts';

/** `git config --list --show-scope -z` as git prints it: a bare key (no value) has no LF. */
const listing = (...entries: readonly (readonly [string, string, string?])[]): string =>
  entries
    .map(([scope, key, value]) => `${scope}\0${key}${value === undefined ? '' : `\n${value}`}\0`)
    .join('');

const FIXED = ['-c', 'core.fsmonitor=false', '-c', 'core.askPass='];

describe('gitGuardOf', () => {
  it("puts back the owner's helpers in their order, and none the repository's files or an env named", () => {
    const owned = listing(
      ['system', 'credential.helper', 'manager'],
      ['global', 'credential.helper', ''],
      ['global', 'credential.https://example.com.helper', 'store'],
      ['local', 'credential.helper', '!evil get'],
      ['worktree', 'credential.https://github.com.helper', '!evil'],
      ['command', 'credential.helper', '!evil'],
      ['local', 'core.fsmonitor', 'evil'],
      ['global', 'core.sshcommand', 'ssh -i ~/.ssh/work'],
      ['local', 'core.sshcommand', 'evil'],
      ['local', 'user.email', 'owner@example.com'],
    );
    expect(gitGuardOf(owned)).toEqual([
      ...FIXED,
      ...['-c', 'core.sshCommand=ssh -i ~/.ssh/work'],
      ...['-c', 'credential.helper='],
      ...['-c', 'credential.helper=manager'],
      ...['-c', 'credential.helper='],
      ...['-c', 'credential.https://example.com.helper=store'],
    ]);
  });

  it("keeps the owner's last ssh command, and plain ssh when only the repository names one", () => {
    const both = listing(['system', 'core.sshcommand', 'ssh -4'], ['global', 'core.sshcommand', 'ssh -6']);
    expect(gitGuardOf(both)).toContain('core.sshCommand=ssh -6');
    expect(gitGuardOf(listing(['local', 'core.sshcommand', 'evil']))).toContain('core.sshCommand=ssh');
  });

  it('leaves out a helper without a value, or under a key that -c cannot carry', () => {
    const odd = listing(
      ['global', 'credential.helper'],
      ['global', 'credential.https://x.test/?a=b.helper', 'y'],
    );
    expect(gitGuardOf(odd)).toEqual([...FIXED, '-c', 'core.sshCommand=ssh', '-c', 'credential.helper=']);
  });

  it('is the strictest when git could not list its config: no helper at all', () => {
    expect(gitGuardOf(undefined)).toEqual([
      ...FIXED,
      '-c',
      'core.sshCommand=ssh',
      '-c',
      'credential.helper=',
    ]);
  });
});

describe('gitGuard on a poisoned repository', () => {
  let root: string;
  let repo: string;
  let poisoned: PoisonedGit;
  /** git prompts no terminal here: the spec may run where one is attached. */
  const env = () => ({ ...poisoned.env, GIT_TERMINAL_PROMPT: '0' });
  const QUESTION = 'protocol=https\nhost=elvaria.invalid\n\n';
  const SSH_REMOTE = 'ssh://git@elvaria.invalid/demo.git';

  let temp: TempDir;
  beforeAll(async () => {
    temp = await tempDir('git guard');
    root = temp.root;
    repo = await gitRepo(path.join(root, 'lãnh thổ'));
    poisoned = await poisonedGit(repo, root);
  });
  afterAll(() => temp.remove());

  it("runs none of the repository's programs, and the owner's ssh command and helper", async () => {
    const git = await gitOf({ resolve: TEST_HOST.resolve, env: poisoned.env });
    expect((await git!(repo, ['status', '--porcelain'])).code).toBe(0);
    expect((await git!(repo, ['fetch', '--quiet', SSH_REMOTE])).code).not.toBe(0);
    const launch = { file: 'git', args: [] };
    const guard = await gitGuard(launch, repo, env());
    const filled = await runToEnd(launch, [...guard, 'credential', 'fill'], {
      cwd: repo,
      env: env(),
      stdin: QUESTION,
      timeout_ms: 60_000,
    });
    expect(filled.code).not.toBe(0);
    expect(await runsIn(poisoned.poison)).toEqual([]);
    const owned = await runsIn(poisoned.owner);
    expect(owned).toContain('helper get');
    expect(owned.some((run) => run.startsWith('ssh ') && run.includes('git@elvaria.invalid'))).toBe(true);

    // The same three without the switches: git runs the repository's fsmonitor, ssh command and helper.
    const bare: SpawnSyncOptions = { cwd: repo, env: env(), stdio: ['pipe', 'ignore', 'ignore'] };
    spawnSync('git', ['status', '--porcelain'], bare);
    spawnSync('git', ['fetch', '--quiet', SSH_REMOTE], bare);
    spawnSync('git', ['credential', 'fill'], { ...bare, input: QUESTION });
    const ran = await runsIn(poisoned.poison);
    expect(ran.some((run) => run.startsWith('fsmonitor '))).toBe(true);
    expect(ran.some((run) => run.startsWith('ssh '))).toBe(true);
    expect(ran).toContain('helper get');
  });

  it('reads a folder once for a plot\x27s git, and again after a read that failed', async () => {
    const home = path.join(root, 'home of a plot');
    await mkdir(home);
    const ssh = ['config', '--file', path.join(home, '.gitconfig'), 'core.sshCommand'];
    gitIn(root, ...ssh, 'ssh -4');
    const guardIn = gitGuards({ file: 'git', args: [] }, { ...minimalEnv(), HOME: home, USERPROFILE: home });
    const later = path.join(root, 'later repo');
    // No folder yet: git cannot list its config there, so the strictest switches.
    expect(await guardIn(later)).toContain('core.sshCommand=ssh');
    expect(await guardIn(repo)).toContain('core.sshCommand=ssh -4');
    gitIn(root, ...ssh, 'ssh -6');
    expect(await guardIn(repo)).toContain('core.sshCommand=ssh -4');
    await gitRepo(later);
    expect(await guardIn(later)).toContain('core.sshCommand=ssh -6');
  });
});
