// A fake git credential helper for the specs (PS-08): the repo's own config empties credential.helper, which drops the
// machine's helpers (Git Credential Manager, osxkeychain) read before it, then names a Node script that answers as a
// helper does. No spec ever reads a real credential. The token has the shape Git Credential Manager hands out
// (`gho_…`), which redact masks, so a spec can look for it in everything the CLI printed or wrote.
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

/** Makes git in `repo` ask the fake helper alone; returns the file where the helper keeps what git asked. */
export async function useFakeHelper(repo: string, dir: string, answer: HelperAnswer): Promise<string> {
  const script = path.join(dir, `credential-${answer}.mjs`);
  const asked = path.join(dir, `credential-${answer}-asked.txt`);
  await writeFile(script, helperSource(answer, asked));
  await writeFile(asked, '');
  // git runs a `!` helper through sh, on Windows too: forward slashes, quoted for the spaces in the folders.
  const slash = (file: string) => file.replaceAll('\\', '/');
  git(repo, 'config', 'credential.helper', '');
  git(repo, 'config', '--add', 'credential.helper', `!"${slash(process.execPath)}" "${slash(script)}"`);
  return asked;
}

/** Every file under `dir` whose text holds `needle`, relative to `dir`: none, for a token. */
export async function filesHolding(dir: string, needle: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
  const texts = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const));
  return texts.filter(([, text]) => text.includes(needle)).map(([file]) => path.relative(dir, file));
}
