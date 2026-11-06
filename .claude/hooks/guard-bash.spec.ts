import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { commitSkipsHooks, refusalOf } from './guard-bash.mjs';
import { REPO } from './hook-io.mjs';

// Commands are assembled from words so that this file, read as a command line, matches none of them.
const cmd = (...words: string[]): string => words.join(' ');

const REFUSED = [
  cmd('git', 'push', '--force', 'origin', 'main'),
  cmd('git', 'push', '-f'),
  cmd('git', 'push', '--force-with-lease'),
  cmd('git', 'push', 'origin', '+feat/p0-11'),
  cmd('git', '-C', 'apps/cli', 'push', '-f'),
  cmd('git', 'commit', '--no-verify', '-m', 'x'),
  cmd('git', 'push', '--no-verify'),
  cmd('HUSKY=0', 'git', 'commit', '-m', 'x'),
  cmd('git', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'x'),
  cmd('git', 'rebase', 'origin/main'),
  cmd('git', 'pull', '--rebase'),
  cmd('git', 'pull', '-r', 'origin', 'main'),
  cmd('git', 'stash'),
  cmd('git', 'stash', '&&', 'git', 'pull'),
  cmd('git', 'stash', 'pop'),
  cmd('git', 'stash', 'drop'),
  cmd('git', 'stash', 'clear'),
  cmd('claude', '-p', 'hi', '--dangerously-skip-permissions'),
  cmd('rm', '-rf', '/c/Users/someone/Documents'),
  cmd('rm', '-rf', String.raw`C:\Windows\Temp2`),
  cmd('rm', '-rf', '~/Documents'),
  cmd('rm', '-rf', '~'),
  cmd('rm', '-r', '-f', '$HOME/Documents'),
  cmd('rm', '-rf', '"${HOME}"'),
  cmd('rm', '-rf', '../..'),
  cmd('rm', '-rf', '../p0-10'),
  cmd('rm', 'dist', '--recursive', '~/Documents'),
  cmd('Remove-Item', '-Recurse', '-Force', String.raw`~\Documents`),
  cmd('Remove-Item', '-Path', String.raw`$env:USERPROFILE\Documents`, '-Recurse'),
  cmd('rd', '-r', String.raw`~\Documents`),
];

const ALLOWED = [
  'git push origin feat/p0-11',
  'git push -u origin feat/p0-11',
  'git commit -m "feat(repo): x"',
  'git commit -am "fix -n handling"',
  'git merge origin/main',
  'git pull --rebase=false origin main',
  'git rebase --abort',
  'git stash list',
  'git stash push -u -m p0-11-wip',
  'git stash apply 1a2b3c4',
  'git stash drop stash@{2}',
  'pnpm check',
  'rm -rf apps/cli/dist',
  `rm -rf "${resolve(REPO, 'packages/hooks/dist')}"`,
  `rm -rf ../${basename(REPO)}/packages/eventlog/dist`,
  `rm -rf "${join(tmpdir(), 'elvaria-test')}"`,
  String.raw`Remove-Item -Recurse -Force apps\cli\dist`,
  'ls -la',
];

describe('refusalOf', () => {
  it.each(REFUSED)('refuses %s', (command) => {
    expect(refusalOf(command)).toEqual(expect.any(String));
  });

  it.each(ALLOWED)('allows %s', (command) => {
    expect(refusalOf(command)).toBeUndefined();
  });

  it('resolves relative delete targets from the session cwd', () => {
    expect(refusalOf(cmd('rm', '-rf', 'Documents'), homedir())).toMatch(/outside the checkout/);
    expect(refusalOf('rm -rf dist', resolve(REPO, 'apps/cli'))).toBeUndefined();
  });

  it('says why: the rule of CLAUDE.md or of the plan behind each refusal', () => {
    expect(refusalOf(cmd('git', 'rebase', 'main'))).toMatch(/git merge origin\/main/);
    expect(refusalOf(cmd('git', 'stash', 'pop'))).toMatch(/shared by every worktree/);
    expect(refusalOf(cmd('git', 'commit', '-n', '-m', 'x'))).toMatch(/--no-verify/);
  });
});

describe('commitSkipsHooks', () => {
  it('finds -n alone or in a cluster, before any flag that takes a value', () => {
    expect(commitSkipsHooks(cmd('git', 'commit', '-n', '-m', 'x'))).toBe(true);
    expect(commitSkipsHooks(cmd('git', 'commit', '-anm', 'x'))).toBe(true);
    expect(commitSkipsHooks(cmd('git', 'commit', '-m', 'x', '-n'))).toBe(true);
    expect(commitSkipsHooks(cmd('git', '-C', 'apps/cli', 'commit', '-n'))).toBe(true);
    expect(commitSkipsHooks(cmd('pnpm', 'check', '&&', 'git', 'commit', '-n'))).toBe(true);
  });

  it('ignores n inside a value: -mn is the message "n", a quoted message is never flags', () => {
    expect(commitSkipsHooks('git commit -mn')).toBe(false);
    expect(commitSkipsHooks('git commit -m -n')).toBe(false);
    expect(commitSkipsHooks('git commit -m "use -n"')).toBe(false);
    expect(commitSkipsHooks('git log -n 3')).toBe(false);
  });
});

describe('guard-bash.mjs as Claude Code runs it', () => {
  const hook = (command: string, cwd = REPO) =>
    spawnSync(process.execPath, [join(REPO, '.claude/hooks/guard-bash.mjs')], {
      input: JSON.stringify({ cwd, tool_name: 'Bash', tool_input: { command } }),
      encoding: 'utf8',
    });

  it('exits 2 with the reason on stderr for a refused command', () => {
    const result = hook(cmd('git', 'push', '--force'));
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^Blocked by \.claude\/hooks\/guard-bash\.mjs: Force push/);
  });

  it('exits 0 in silence for an allowed command, and for a payload that is not JSON', () => {
    expect(hook('git status')).toMatchObject({ status: 0, stderr: '' });
    const garbage = spawnSync(process.execPath, [join(REPO, '.claude/hooks/guard-bash.mjs')], {
      input: 'not json',
      encoding: 'utf8',
    });
    expect(garbage.status).toBe(0);
  });
});
