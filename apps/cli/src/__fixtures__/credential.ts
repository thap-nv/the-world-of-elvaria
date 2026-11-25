// A fake git credential helper for the specs (PS-08): the spec's own home (its HOME and USERPROFILE) holds a
// .gitconfig that empties credential.helper, which drops the machine's helpers (Git Credential Manager, osxkeychain)
// read before it, then names a Node script that answers as a helper does. The home, not the repo: git of a delivery
// asks the owner's helpers alone, never one that a territory's config names (SEC-02). No spec ever reads a real
// credential. The token has the shape Git Credential Manager hands out (`gho_…`), which redact masks, so a spec can
// look for it in everything the CLI printed or wrote.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { git } from './cli.ts';

export const FAKE_TOKEN = `gho_${'F4keT0kenOfTheElvariaSpecs'.padEnd(36, '0')}`;
export const FAKE_USER = 'spec-account';
export const GITHUB_REMOTE = 'https://github.com/elvaria-specs/kingdom-repo.git';

/** `token`: a stored credential; `nothing`: none (git then exits 128, prompts being off); `hang`: never answers. */
export type HelperAnswer = 'token' | 'nothing' | 'hang';

const ANSWERS: Readonly<Record<HelperAnswer, string>> = {
  token: `process.stdout.write(${JSON.stringify(`username=${FAKE_USER}\npassword=${FAKE_TOKEN}\n`)});`,
  nothing: '',
  hang: 'setInterval(() => undefined, 1000);',
};

/** git runs a `!` helper (and fsmonitor, ssh) through sh, on Windows too: forward slashes, quoted for the spaces. */
const slash = (file: string) => file.replaceAll('\\', '/');

/** The helper reads git's whole question first, as a real one does, and keeps it in `asked` for the spec. */
const helperSource = (answer: HelperAnswer, asked: string): string =>
  [
    "import { appendFileSync } from 'node:fs';",
    "let question = '';",
    "process.stdin.setEncoding('utf8').on('data', (chunk) => { question += chunk; });",
    "process.stdin.on('end', () => {",
    `  appendFileSync(${JSON.stringify(asked)}, question);`,
    `  if (process.argv[2] === 'get') { ${ANSWERS[answer]} }`,
    '});',
    '',
  ].join('\n');

/**
 * Makes git, run with `home` as its HOME and USERPROFILE, ask the fake helper alone; returns the file where the
 * helper keeps what git asked.
 */
export async function useFakeHelper(home: string, dir: string, answer: HelperAnswer): Promise<string> {
  const script = path.join(dir, `credential-${answer}.mjs`);
  const asked = path.join(dir, `credential-${answer}-asked.txt`);
  await writeFile(script, helperSource(answer, asked));
  await writeFile(asked, '');
  const config = ['config', '--file', path.join(home, '.gitconfig')];
  // --replace-all: a second territory of the same spec names the helper again, in place of the first.
  git(dir, ...config, '--replace-all', 'credential.helper', '');
  git(dir, ...config, '--add', 'credential.helper', `!"${slash(process.execPath)}" "${slash(script)}"`);
  return asked;
}

/**
 * A program that notes each run of it in a file (its name and git's arguments, one line a run) and ends at once: it
 * reads no input, since git keeps an ssh command's stdin open, and answers nothing.
 */
const MARK_SOURCE = [
  "import { appendFileSync } from 'node:fs';",
  "appendFileSync(process.argv[2], `${process.argv.slice(3).join(' ')}\\n`);",
  '',
].join('\n');

/**
 * Makes `repo`'s own config name a program for fsmonitor, ssh and the credential helper, as code a session runs
 * could (threat model A5, SEC-02); returns the file where each run of one is noted.
 */
export async function poisonRepo(repo: string, dir: string): Promise<string> {
  const script = path.join(dir, 'poison.mjs');
  const marker = path.join(dir, 'poison-ran.txt');
  await writeFile(script, MARK_SOURCE);
  const program = (name: string) =>
    `"${slash(process.execPath)}" "${slash(script)}" "${slash(marker)}" ${name}`;
  git(repo, 'config', 'core.fsmonitor', program('fsmonitor'));
  git(repo, 'config', 'core.sshCommand', program('ssh'));
  git(repo, 'config', 'credential.helper', `!${program('helper')}`);
  return marker;
}

/** What `poisonRepo`'s programs noted: one line a run, none when git ran none of them. */
export const poisonRuns = async (marker: string): Promise<string[]> =>
  (await readFile(marker, 'utf8').catch(() => '')).split('\n').filter((line) => line !== '');

/** Every file under `dir` whose text holds `needle`, relative to `dir`: none, for a token. */
export async function filesHolding(dir: string, needle: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
  const texts = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const));
  return texts.filter(([, text]) => text.includes(needle)).map(([file]) => path.relative(dir, file));
}
