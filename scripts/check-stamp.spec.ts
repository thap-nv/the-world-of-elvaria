// Real git repos in a temp folder whose name has a space. git runs without the caller's GIT_* variables: the
// pre-push hook that runs these tests exports GIT_DIR, and a `git commit` that inherits it writes into the repo being
// pushed (implementation-plan §6).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pushedRefs, verdictOf } from './check-stamp.mjs';

const SCRIPT = path.join(import.meta.dirname, 'check-stamp.mjs');
const HOOK = path.join(import.meta.dirname, '..', '.husky', 'pre-push');
const ZERO = '0'.repeat(40);
const SHA = 'a'.repeat(40);

/** What git and node need; node's own folder first, as the hook finds `node` on PATH. */
function testEnv(): Record<string, string> {
  const keys = ['SystemRoot', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR'];
  const env = Object.fromEntries(keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
  return { ...env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}` };
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: testEnv() }).trim();

/** The script as `pnpm check` and the hook run it, in `cwd`, with `input` on stdin. */
function stamp(cwd: string, mode: string, input = ''): { status: number | null; out: string } {
  const run = spawnSync(process.execPath, [SCRIPT, mode], { cwd, input, encoding: 'utf8', env: testEnv() });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

/** `pnpm check` from its first step to its last, green. */
function greenCheck(cwd: string): void {
  expect(stamp(cwd, 'start').status).toBe(0);
  expect(stamp(cwd, 'write').status).toBe(0);
}

/** The hook's stdin for a push of `sha` to `ref` (githooks(5)). */
const pushOf = (sha: string, ref = 'refs/heads/main'): string => `${ref} ${sha} ${ref} ${ZERO}\n`;

async function commit(repo: string, file: string, text: string): Promise<string> {
  await writeFile(path.join(repo, file), text);
  git(repo, 'add', '--all');
  git(repo, 'commit', '-q', '-m', `change ${file}`);
  return git(repo, 'rev-parse', 'HEAD');
}

describe('verdictOf', () => {
  const noWorktree = () => {
    throw new Error('the worktree was read');
  };

  it('skips a push that sends no commit without reading the worktree', () => {
    expect(verdictOf('', noWorktree).skip).toBe(true);
    expect(verdictOf(`(delete) ${ZERO} refs/heads/old ${SHA}\n`, noWorktree).skip).toBe(true);
  });

  it('runs check:fast on input that does not read as git push lines', () => {
    for (const input of ['garbage\n', `refs/heads/main ${SHA} refs/heads/main\n`, pushOf('xyz')]) {
      expect(verdictOf(input, noWorktree)).toMatchObject({ skip: false });
    }
  });

  it('runs check:fast for a stamp a check only started', () => {
    const worktree = () => ({ head: SHA, clean: true, stamp: `pending ${SHA}` });
    expect(verdictOf(pushOf(SHA), worktree).skip).toBe(false);
  });
});

describe('pushedRefs', () => {
  it('keeps the commits a push sends and drops the branches it deletes', () => {
    const input = `refs/heads/a ${SHA} refs/heads/a ${ZERO}\r\n(delete) ${ZERO} refs/heads/b ${SHA}\n\n`;
    expect(pushedRefs(input)).toEqual([{ ref: 'refs/heads/a', sha: SHA }]);
  });

  it('reads sha-256 object names', () => {
    const long = 'b'.repeat(64);
    expect(pushedRefs(`refs/heads/a ${long} refs/heads/a ${'0'.repeat(64)}`)).toEqual([
      { ref: 'refs/heads/a', sha: long },
    ]);
  });
});

describe('check stamp in a git repo', () => {
  let root: string;
  let temp: TempDir;
  let repo: string;
  let first: string;
  let head: string;

  beforeEach(async () => {
    temp = await tempDir('check stamp');
    root = temp.root;
    repo = path.join(root, 'my repo');
    await mkdir(repo);
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.name', 'Elvaria Test');
    git(repo, 'config', 'user.email', 'test@elvaria.invalid');
    git(repo, 'config', 'core.autocrlf', 'false');
    first = await commit(repo, 'README.md', '# demo\n');
    head = await commit(repo, 'notes.md', 'one\n');
  });
  afterEach(() => temp.remove());

  it('lets the hook skip check:fast for HEAD after a green check on a clean tree', () => {
    greenCheck(repo);
    expect(readFileSync(path.join(repo, '.git', 'elvaria-check-ok'), 'utf8')).toBe(`${head}\n`);
    const verify = stamp(repo, 'verify', pushOf(head));
    expect(verify.status).toBe(0);
    expect(verify.out).toContain('skipping pnpm check:fast');
  });

  it('runs check:fast when no check has stamped the worktree', () => {
    const verify = stamp(repo, 'verify', pushOf(head));
    expect(verify.status).toBe(1);
    expect(verify.out).toContain('running pnpm check:fast');
  });

  it('runs check:fast once HEAD has moved past the stamp, whichever of the two is pushed', async () => {
    greenCheck(repo);
    const next = await commit(repo, 'notes.md', 'two\n');
    expect(stamp(repo, 'verify', pushOf(next)).status).toBe(1);
    expect(stamp(repo, 'verify', pushOf(head)).status).toBe(1);
  });

  it('runs check:fast when the tree has changes, tracked or untracked', async () => {
    greenCheck(repo);
    await writeFile(path.join(repo, 'notes.md'), 'edited\n');
    expect(stamp(repo, 'verify', pushOf(head)).status).toBe(1);
    git(repo, 'checkout', '--', 'notes.md');
    expect(stamp(repo, 'verify', pushOf(head)).status).toBe(0);
    await writeFile(path.join(repo, 'new.md'), 'new\n');
    expect(stamp(repo, 'verify', pushOf(head)).status).toBe(1);
  });

  it('runs check:fast for a push of a ref that is not HEAD, alone or beside HEAD', () => {
    git(repo, 'branch', 'older', first);
    greenCheck(repo);
    const older = pushOf(first, 'refs/heads/older');
    expect(stamp(repo, 'verify', older).status).toBe(1);
    expect(stamp(repo, 'verify', `${pushOf(head)}${older}`).status).toBe(1);
  });

  it('skips a push that only deletes branches, with no stamp and a changed tree', async () => {
    await writeFile(path.join(repo, 'notes.md'), 'edited\n');
    const deletion = `(delete) ${ZERO} refs/heads/old ${first}\n`;
    expect(stamp(repo, 'verify', deletion).status).toBe(0);
    expect(stamp(repo, 'verify', '').status).toBe(0);
    expect(stamp(repo, 'verify', `${deletion}${pushOf(head)}`).status).toBe(1);
  });

  it('stamps nothing when the tree had changes as the check started, even if they are gone at its end', async () => {
    await writeFile(path.join(repo, 'notes.md'), 'edited\n');
    expect(stamp(repo, 'start').out).toContain('no stamp');
    git(repo, 'checkout', '--', 'notes.md');
    expect(stamp(repo, 'write').out).toContain('no stamp');
    expect(stamp(repo, 'verify', pushOf(head)).status).toBe(1);
  });

  it('stamps nothing when a commit lands while the check runs', async () => {
    stamp(repo, 'start');
    const next = await commit(repo, 'notes.md', 'two\n');
    expect(stamp(repo, 'write').out).toContain('no stamp');
    expect(stamp(repo, 'verify', pushOf(next)).status).toBe(1);
  });

  it('stamps nothing on a write without a start, and a check that starts forgets the last stamp', () => {
    expect(stamp(repo, 'write').out).toContain('no stamp');
    expect(stamp(repo, 'verify', pushOf(head)).status).toBe(1);
    greenCheck(repo);
    stamp(repo, 'start');
    expect(stamp(repo, 'verify', pushOf(head)).status).toBe(1);
  });

  it('keeps one stamp per worktree', () => {
    const second = path.join(root, 'second tree');
    git(repo, 'worktree', 'add', '-q', '-b', 'second', second);
    greenCheck(repo);
    expect(stamp(second, 'verify', pushOf(head, 'refs/heads/second')).status).toBe(1);
    greenCheck(second);
    expect(stamp(second, 'verify', pushOf(head, 'refs/heads/second')).status).toBe(0);
    expect(stamp(repo, 'verify', pushOf(head)).status).toBe(0);
  });

  it('refuses a mode it does not know', () => {
    expect(stamp(repo, 'stamp').status).toBe(2);
  });
});

describe('.husky/pre-push in a real git push', () => {
  let root: string;
  let temp: TempDir;
  let repo: string;

  /** git push with its hook's output; the hook's `pnpm` only says it ran. */
  function push(...args: string[]): string {
    const run = spawnSync('git', ['push', ...args], { cwd: repo, encoding: 'utf8', env: testEnv() });
    expect(run.status).toBe(0);
    return `${run.stdout}${run.stderr}`;
  }

  beforeEach(async () => {
    temp = await tempDir('check stamp push');
    root = temp.root;
    repo = path.join(root, 'my repo');
    const hooks = path.join(root, 'hooks');
    await mkdir(path.join(repo, 'scripts'), { recursive: true });
    await mkdir(hooks);
    git(root, 'init', '-q', '--bare', 'remote.git');
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.name', 'Elvaria Test');
    git(repo, 'config', 'user.email', 'test@elvaria.invalid');
    git(repo, 'config', 'core.autocrlf', 'false');
    git(repo, 'config', 'core.hooksPath', hooks.replaceAll('\\', '/'));
    git(repo, 'remote', 'add', 'origin', path.join(root, 'remote.git'));
    // The hook calls the script by its path in the repo, so the repo carries a copy of it.
    await copyFile(SCRIPT, path.join(repo, 'scripts', 'check-stamp.mjs'));
    await commit(repo, 'README.md', '# demo\n');
    const hook = `#!/bin/sh\npnpm() { echo "fake pnpm $*"; }\n. "${HOOK.replaceAll('\\', '/')}"\n`;
    await writeFile(path.join(hooks, 'pre-push'), hook, { mode: 0o755 });
  });
  afterEach(() => temp.remove());

  it('skips check:fast for the stamped HEAD and a branch deletion, and runs it otherwise', async () => {
    expect(push('-q', 'origin', 'main')).toContain('fake pnpm check:fast');
    await commit(repo, 'notes.md', 'one\n');
    greenCheck(repo);
    const stamped = push('-q', 'origin', 'main', 'main:refs/heads/extra');
    expect(stamped).toContain('skipping pnpm check:fast');
    expect(stamped).not.toContain('fake pnpm');
    await commit(repo, 'notes.md', 'two\n');
    expect(push('-q', 'origin', '--delete', 'extra')).not.toContain('fake pnpm');
    expect(push('-q', 'origin', 'main')).toContain('fake pnpm check:fast');
  });
});
