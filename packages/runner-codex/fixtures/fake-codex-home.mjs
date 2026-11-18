// The home folder of fake-codex.mjs (PS-27c, spike codex-home-2026-11-17): CODEX_HOME, else `<home>/.codex`, which is
// only a name: nothing is read or written under the real home. Like the real CLI, which writes its state into the
// folder on its first call, every call appends a line to `<folder>/fake-calls.jsonl` when the variable is set; a spec
// reads which folder each call ran in. A folder is signed in once it holds `auth.json`, the file `codex login` writes;
// the default folder always is. ELVARIA_FAKE_CODEX_LOGGED_OUT=1 signs every folder out. The account is the folder's
// name: two folders of one name are one account (minimalEnv drops any knob, so a knob could not say so through
// apps/cli). `<folder>/fake-rate-limits.json`, when there, is what account/rateLimits/read answers.
// ELVARIA_FAKE_CODEX_IGNORES_HOME=1 plays a Codex that does not hear the variable: it runs in the default folder.
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const { env } = process;

/** The folder the variable names, unless this Codex does not hear it. */
const given = () => (env.ELVARIA_FAKE_CODEX_IGNORES_HOME === '1' ? undefined : env.CODEX_HOME);

/** The home this Codex runs in, as `initialize` names it (`codexHome`). */
export const homeDir = () => given() ?? path.join(os.homedir(), '.codex');

/** One line in the home per call, only when CODEX_HOME names it: never in the real home. */
export function noteCall(call) {
  const dir = given();
  if (dir === undefined) return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, 'fake-calls.jsonl'), `${JSON.stringify({ call })}\n`);
}

/** Which call argv is, for fake-calls.jsonl; the app-server notes each method it answers instead. */
export function noteArgv(argv) {
  if (argv[0] === 'app-server') return;
  if (argv.includes('--version')) noteCall('version');
  else if (argv[0] === 'exec') noteCall(argv[1] === 'resume' ? 'resume' : 'exec');
  else noteCall(argv[0] ?? 'none');
}

export function signedIn() {
  if (env.ELVARIA_FAKE_CODEX_LOGGED_OUT === '1') return false;
  const dir = given();
  return dir === undefined || existsSync(path.join(dir, 'auth.json'));
}

/** The account of the home: its folder's name. */
export const accountId = () => `acct-${path.basename(homeDir())}`;

/** The home's own windows when it has them, else ELVARIA_FAKE_CODEX_RATE_LIMITS or rate-limits.json of `fixtures`. */
export function rateLimitsFile(fixtures) {
  const dir = given();
  const own = dir === undefined ? undefined : path.join(dir, 'fake-rate-limits.json');
  if (own !== undefined && existsSync(own)) return own;
  return path.resolve(fixtures, env.ELVARIA_FAKE_CODEX_RATE_LIMITS ?? 'rate-limits.json');
}
