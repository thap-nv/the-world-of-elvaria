// Git repos for the plot and check specs. Every folder name has a space (`D:\Dummy\Tool - DC1`, CLAUDE.md), and git
// runs without the caller's GIT_* variables: husky's pre-push hook exports GIT_DIR, and a `git init` or `commit`
// that inherits it writes into the repo being pushed (implementation-plan §6).
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { QuestIdSchema, TerritorySchema } from '@elvaria/domain';
import type { QuestId, Territory } from '@elvaria/domain';
import { toPortable } from '@elvaria/store';

import type { ProcessHost } from '../process/program.ts';

/** What a child needs to start, as the composition root would pass it (implementation-plan §3.9). */
const PASSED = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'TMPDIR',
  'SystemRoot',
];

export const minimalEnv = (): Record<string, string> =>
  Object.fromEntries(
    PASSED.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])),
  );

/** `node` is this Node; anything else is left to the OS search of PATH, which finds git.exe without a shell. */
export const TEST_HOST: ProcessHost = {
  resolve: (name) => Promise.resolve({ file: name === 'node' ? process.execPath : name, args: [] }),
  env: minimalEnv(),
};

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: minimalEnv() }).trim();

/** A repo on `main` with one commit, its own identity, and node_modules ignored like a real territory. */
export async function gitRepo(folder: string): Promise<string> {
  await mkdir(folder, { recursive: true });
  git(folder, 'init', '-q', '-b', 'main');
  git(folder, 'config', 'user.name', 'Elvaria Test');
  git(folder, 'config', 'user.email', 'test@elvaria.invalid');
  git(folder, 'config', 'core.autocrlf', 'false');
  await writeFile(path.join(folder, '.gitignore'), 'node_modules/\n');
  await writeFile(path.join(folder, 'README.md'), '# demo\n');
  git(folder, 'add', '--all');
  git(folder, 'commit', '-q', '-m', 'first');
  return folder;
}

/** Writes `text` to `file` under `repo` and commits it. */
export async function commitFile(repo: string, file: string, text: string, message = `add ${file}`) {
  await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
  await writeFile(path.join(repo, file), text);
  git(repo, 'add', '--all');
  git(repo, 'commit', '-q', '-m', message);
}

export const questId = (suffix: string): QuestId => QuestIdSchema.parse(`q_20261107_${suffix}`);

export function territoryAt(repo: string, fields: Record<string, unknown> = {}): Territory {
  return TerritorySchema.parse({
    version: 1,
    id: 'demo',
    name: 'Demo',
    path: toPortable(repo),
    kind: 'code',
    vcs: { type: 'git', default_branch: 'main' },
    ...fields,
  });
}
