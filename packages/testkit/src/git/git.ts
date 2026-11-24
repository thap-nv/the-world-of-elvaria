// Git repos for specs (architecture-health V7, K6). Git always runs without the caller's GIT_* variables: husky's
// pre-push hook runs the tests and git exports GIT_DIR to it, so a `git init` or `commit` that inherits it writes
// into the repo being pushed (implementation-plan §6: once a commit landed on the branch and core.bare = true).
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/** The repo's own settings: an identity of nobody's, no signing, files kept byte for byte on every OS. */
const REPO_CONFIG: readonly (readonly [string, string])[] = [
  ['user.name', 'Elvaria Test'],
  ['user.email', 'test@elvaria.invalid'],
  ['commit.gpgsign', 'false'],
  ['core.autocrlf', 'false'],
];

/** `env` without git's own variables; the match ignores case, as Windows does for env names. */
export const envWithoutGit = (env: NodeJS.ProcessEnv = process.env): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).flatMap(([name, value]) =>
      value === undefined || /^GIT_/i.test(name) ? [] : [[name, value]],
    ),
  );

/** Runs git in `cwd` without a shell and without GIT_*; returns its output, trimmed; throws when git fails. */
export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: envWithoutGit(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();

/** Writes `files` (repo-relative `/` path → text) under `repo`, adds and commits them; returns the commit sha. */
export async function commitFiles(
  repo: string,
  files: Readonly<Record<string, string>>,
  message = 'change',
): Promise<string> {
  for (const [file, text] of Object.entries(files)) {
    const target = path.join(repo, ...file.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
  }
  git(repo, 'add', '--all');
  git(repo, 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

/** A repo at `folder` (made if missing) on `main`, whose first commit holds `files`. */
export async function gitRepo(
  folder: string,
  files: Readonly<Record<string, string>> = { 'README.md': '# demo\n' },
): Promise<string> {
  await mkdir(folder, { recursive: true });
  git(folder, 'init', '-q', '-b', 'main');
  for (const [key, value] of REPO_CONFIG) git(folder, 'config', key, value);
  await commitFiles(folder, files, 'first');
  return folder;
}
