// The repo as docs:gen and docs:check see it: files git tracks or would track, read and written by repo-relative
// path with `/`. Tests pass an in-memory repo of the same shape instead.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** @typedef {{ list(): string[]; read(file: string): string | undefined; write(file: string, text: string): void }} Repo */

export const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Only what git needs from the environment; never process.env whole (CLAUDE.md, ADR 0013). */
function gitEnv() {
  const keys = ['PATH', 'SystemRoot', 'HOME', 'USERPROFILE'];
  return Object.fromEntries(keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
}

/** Tracked files and untracked ones .gitignore lets in, so a new file is checked before its first commit. */
function gitFiles() {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: REPO_ROOT,
    env: gitEnv(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // A file deleted in the work tree is still in the index until the deletion is staged.
  return [...new Set(out.split('\0'))]
    .filter((file) => file !== '' && existsSync(join(REPO_ROOT, file)))
    .sort();
}

/** @returns {Repo} */
export function gitRepo() {
  return {
    list: gitFiles,
    read: (file) =>
      existsSync(join(REPO_ROOT, file)) ? readFileSync(join(REPO_ROOT, file), 'utf8') : undefined,
    write: (file, text) => {
      mkdirSync(dirname(join(REPO_ROOT, file)), { recursive: true });
      writeFileSync(join(REPO_ROOT, file), text);
    },
  };
}
