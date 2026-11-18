// The calls of fake-claude.mjs that open no session: `--version`, `auth status --json`, `purge --yes <dir>`, `-p
// /usage`. Knobs: FAKE_CLAUDE_AUTH=logged_out|hangs, FAKE_CLAUDE_LOGIN_EXPIRES=<ISO> (loginExpiresAt), FAKE_CLAUDE_PURGE=
// nothing|fail (the two answers of the real purge run of P1-07 besides success), FAKE_CLAUDE_USAGE_TEXT=<text of
// /usage>, FAKE_CLAUDE_IGNORES_CONFIG_DIR=1 (auth status names the default folder whatever CLAUDE_CONFIG_DIR says).
// The config folder (PS-27, spike claude-config-dir-2026-11-17): CLAUDE_CONFIG_DIR, else `<home>/.claude`. Like the
// real CLI, which keeps a transcript of each call there, every call appends a line to `<folder>/fake-calls.jsonl`
// when the variable is set; a spec reads which folder each call ran in. The account is the folder's name: two
// folders of one name are one account. `<folder>/fake-usage.jsonl`, when there, is what /usage replays. Nothing is
// read or written under the real home: without the variable the default folder is only a name.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const env = process.env;
const out = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const DEFAULT_DIR = () => path.join(os.homedir(), '.claude');
const configDir = () => env.CLAUDE_CONFIG_DIR ?? DEFAULT_DIR();

/** Which call argv is, for fake-calls.jsonl. */
const callOf = (argv, ping) => {
  if (argv[0] !== '-p') return argv[0]?.replace(/^--/, '') ?? 'none';
  if (argv[1] === '/usage') return 'usage';
  return argv[1] === ping ? 'ping' : 'session';
};

/** One line in the config folder per call, only when CLAUDE_CONFIG_DIR names it: never in the real home. */
export function noteCall(argv, ping) {
  const dir = env.CLAUDE_CONFIG_DIR;
  if (dir === undefined) return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, 'fake-calls.jsonl'), `${JSON.stringify({ call: callOf(argv, ping) })}\n`);
}

function purge(argv) {
  if (env.FAKE_CLAUDE_PURGE === undefined) return 0;
  const nothing = env.FAKE_CLAUDE_PURGE === 'nothing';
  const why = nothing ? `No Claude Code project state found for ${argv.at(-1)} under ~/.claude.` : 'EBUSY';
  process.stderr.write(`${why}\n`);
  return nothing ? 1 : 3;
}

function auth() {
  if (env.FAKE_CLAUDE_AUTH === 'hangs') {
    // A busy machine or a network that does not answer: never ends, doctor's timeout kills it (fix/busy-machine).
    setInterval(() => undefined, 60_000);
    return 0;
  }
  const loggedIn = env.FAKE_CLAUDE_AUTH !== 'logged_out';
  const dir = env.FAKE_CLAUDE_IGNORES_CONFIG_DIR === '1' ? DEFAULT_DIR() : configDir();
  const name = path.basename(dir);
  out({
    loggedIn,
    authMethod: loggedIn ? 'claude.ai' : 'none',
    loginExpiresAt: env.FAKE_CLAUDE_LOGIN_EXPIRES,
    configDirectory: dir,
    ...(loggedIn ? { email: `${name}@example.com`, orgId: `org-${name}` } : {}),
  });
  return loggedIn ? 0 : 1;
}

function version() {
  process.stdout.write('2.1.318 (Claude Code)\n');
  return 0;
}

/** `-p /usage`: FAKE_CLAUDE_USAGE_TEXT, else the folder's fake-usage.jsonl, else the real run's usage-command.jsonl. */
export function usage() {
  const text = env.FAKE_CLAUDE_USAGE_TEXT;
  if (text !== undefined) {
    out({ type: 'system', subtype: 'init', session_id: 'fake-usage' });
    out({ type: 'result', subtype: 'success', is_error: false, num_turns: 0, result: text, session_id: 'u' });
    return 0;
  }
  const dir = env.CLAUDE_CONFIG_DIR;
  const own = dir === undefined ? undefined : path.join(dir, 'fake-usage.jsonl');
  const file =
    own !== undefined && existsSync(own) ? own : path.join(import.meta.dirname, 'usage-command.jsonl');
  const lines = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  lines.forEach((line) => process.stdout.write(`${line}\n`));
  return 0;
}

export const COMMANDS = { '--version': version, auth, purge };
