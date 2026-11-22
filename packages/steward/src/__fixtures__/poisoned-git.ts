// A territory whose own git config names programs for git to run, as code a session runs could write it (threat model
// A5, SEC-02), and a home whose .gitconfig names the owner's own credential helper. Each program notes its runs in a
// file, the territory's in one and the owner's in another, so a spec sees which ones a delivery's git ran.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { childEnv, git } from './git-plots.ts';

/** Notes its name and git's arguments, one line a run, and ends at once: it reads no input and answers nothing. */
const MARK_SOURCE = [
  "import { appendFileSync } from 'node:fs';",
  "appendFileSync(process.argv[2], `${process.argv.slice(3).join(' ')}\\n`);",
  '',
].join('\n');

/** git runs these through sh, on Windows too: forward slashes, quoted for the spaces in the folders. */
const slash = (file: string): string => file.replaceAll('\\', '/');

export interface PoisonedGit {
  /** Where the territory's programs note their runs. */
  readonly poison: string;
  /** Where the owner's helper notes its. */
  readonly owner: string;
  /** The Steward's env, HOME and USERPROFILE moved to the owner's home. */
  readonly env: Record<string, string>;
}

/** Poisons `repo`'s config (fsmonitor, ssh command, credential helper) and makes a home for the owner in `dir`. */
export async function poisonedGit(repo: string, dir: string): Promise<PoisonedGit> {
  const script = path.join(dir, 'mark.mjs');
  await writeFile(script, MARK_SOURCE);
  const poison = path.join(dir, 'poison-ran.txt');
  const owner = path.join(dir, 'owner-ran.txt');
  const program = (marker: string, name: string): string =>
    `"${slash(process.execPath)}" "${slash(script)}" "${slash(marker)}" ${name}`;
  git(repo, 'config', 'core.fsmonitor', program(poison, 'fsmonitor'));
  git(repo, 'config', 'core.sshCommand', program(poison, 'ssh'));
  git(repo, 'config', 'credential.helper', `!${program(poison, 'helper')}`);
  const home = path.join(dir, 'home');
  await mkdir(home, { recursive: true });
  const config = ['config', '--file', path.join(home, '.gitconfig')];
  // An empty helper first: the machine's own (Git Credential Manager, osxkeychain) are never asked by a spec.
  git(dir, ...config, 'credential.helper', '');
  git(dir, ...config, '--add', 'credential.helper', `!${program(owner, 'helper')}`);
  return { poison, owner, env: { ...childEnv(), HOME: home, USERPROFILE: home } };
}

/** The runs a marker file holds, one line each; none when git ran no program of it. */
export const runsIn = async (marker: string): Promise<string[]> =>
  (await readFile(marker, 'utf8').catch(() => '')).split('\n').filter((line) => line !== '');
