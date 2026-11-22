// A forge credential from git's own store (PS-08, ADR 0023): `git credential fill` each time one is needed, and never
// kept. It runs in the territory's folder as the push does, so the owner's conditional includes and the territory's
// credential.username count, with the switches of gitGuard: the owner's helpers alone (system and global config),
// never one that the territory's own config names (SEC-02). No window and no prompt, since nobody sits at a background
// delivery: GIT_TERMINAL_PROMPT=0 is the one GIT_* variable Elvaria sets ((L) of the PS-08 plan,
// .claude/rules/runner.md), GCM_INTERACTIVE=never keeps Git Credential Manager from opening its window, and
// gitGuard's empty core.askPass any askpass program. macOS's osxkeychain has no such switch and may ask once whether
// git may read the Keychain, so every call has a time limit (measured on Windows only, row 29 of the plan). The value
// goes back to the caller alone, never to stdout, an event or a log.
import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';
import { gitGuard, runToEnd } from '@elvaria/runner-core';
import { DELIVERY_GIT_SWITCHES } from '@elvaria/steward';

import { findExecutable } from '../process/find-executable.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { credentialPathOf } from './remote.ts';
import type { CliIo } from '../io.ts';
import type { ForgeRepo } from './remote.ts';

/** A stored credential answers in 0.3 s on Windows (row 29); the rest is a busy machine or a dialog nobody sees. */
export const CREDENTIAL_TIMEOUT_MS = 10_000;

export interface ForgeCredential {
  readonly username: string;
  /** The token: for the caller's request only. */
  readonly password: string;
}

/** `none`: git has no credential for the host (it exits 128 rather than prompt); `timeout`: stopped at the limit. */
export type CredentialProblem = 'none' | 'timeout' | 'no_git';

/**
 * The env of a delivery's git: the minimal one (the helper finds its store through HOME, USERPROFILE, APPDATA,
 * LOCALAPPDATA) and the two switches that forbid asking anyone.
 */
export const deliveryGitEnv = (io: CliIo): Record<string, string> => ({
  ...minimalEnv(io.env),
  ...DELIVERY_GIT_SWITCHES,
});

/** `key=value` lines as git prints them; a value may hold `=`. */
function fieldsOf(stdout: string): Map<string, string> {
  return new Map(
    stdout.split('\n').flatMap((line) => {
      const at = line.indexOf('=');
      return at <= 0 ? [] : [[line.slice(0, at), line.slice(at + 1).replace(/\r$/, '')] as const];
    }),
  );
}

/** The https credential git keeps for `repo`'s host, asked in `cwd` (the territory's folder). */
export async function readCredential(
  io: CliIo,
  cwd: string,
  repo: ForgeRepo,
  timeoutMs = CREDENTIAL_TIMEOUT_MS,
): Promise<Result<ForgeCredential, CredentialProblem>> {
  const file = await findExecutable('git', io.env, io.platform);
  if (file === undefined) return err('no_git');
  const query = `protocol=https\nhost=${repo.host}\npath=${credentialPathOf(repo)}\n\n`;
  const launch = { file, args: [] };
  const env = deliveryGitEnv(io);
  const guard = await gitGuard(launch, cwd, env);
  const run = await runToEnd(launch, [...guard, 'credential', 'fill'], {
    cwd,
    env,
    stdin: query,
    timeout_ms: timeoutMs,
  });
  if (run.timed_out) return err('timeout');
  if (run.failure !== undefined) return err('no_git');
  const fields = fieldsOf(run.stdout);
  const password = fields.get('password') ?? '';
  if (run.code !== 0 || password === '') return err('none');
  return ok({ username: fields.get('username') ?? '', password });
}
