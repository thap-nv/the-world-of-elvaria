// The calls of fake-claude.mjs that open no session: `--version`, `auth status --json`, `purge --yes <dir>`.
// Knobs: FAKE_CLAUDE_AUTH=logged_out|hangs, FAKE_CLAUDE_LOGIN_EXPIRES=<ISO> (loginExpiresAt), FAKE_CLAUDE_PURGE=
// nothing|fail (the two answers of the real purge run of P1-07 besides success).
import process from 'node:process';

const env = process.env;
const out = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

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
  out({
    loggedIn,
    authMethod: loggedIn ? 'claude.ai' : 'none',
    loginExpiresAt: env.FAKE_CLAUDE_LOGIN_EXPIRES,
  });
  return loggedIn ? 0 : 1;
}

function version() {
  process.stdout.write('2.1.318 (Claude Code)\n');
  return 0;
}

export const COMMANDS = { '--version': version, auth, purge };
