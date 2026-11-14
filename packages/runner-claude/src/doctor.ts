// doctor(): which Claude Code, which version, logged in or not (implementation-plan §3.7; spike P1-02). The login
// is read with `claude auth status --json` (no model call, exit 1 when logged out); a call stopped at its timeout or
// that never started says so, not "not logged in" (fix/busy-machine). A session also needs the
// built hook, `packages/hooks/dist/elvaria-hook.js`: without it every hook call fails and the runner judges each
// session broken, so doctor fails, as every tribe's does (runner-core; before fix/held-tribe-sessions, only a warning).
import { hookProblem } from '@elvaria/runner-core';

import { parseLine } from './json.ts';
import { launchOf } from './launch.ts';
import { runOnce } from './run-once.ts';
import type { Ran, RunOnceOptions } from './run-once.ts';
import type { ToolInfo } from '@elvaria/runner-core';

export interface DoctorDeps extends RunOnceOptions {
  /** The pinned or located CLI; undefined when none was found. */
  readonly executable: string | undefined;
  readonly nodePath: string;
  readonly hookScript: string;
  /** Epoch ms: when the sign-in is close to its end. */
  readonly now: () => number;
}

const VERSION = /\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.-]+)?/;
/**
 * A sign-in ends on a fixed date, and a session after it fails (the CLI warns days before; P1-07 run). A week
 * leaves the owner time to run `claude auth login`.
 */
export const SIGN_IN_WARNING_DAYS = 7;
const DAY_MS = 86_400_000;

export const NOT_FOUND =
  'Claude Code not found on PATH, in ~/.local/bin, in %APPDATA%\\npm or in a VS Code extension folder';

/** `2.1.318 (Claude Code)` → `2.1.318`. */
export const versionOf = (stdout: string): string | undefined => VERSION.exec(stdout)?.[0];

/** `loginExpiresAt` of `claude auth status --json`, when it falls within the warning window. */
export function signInEnding(expiresAt: unknown, now: number): string | undefined {
  if (typeof expiresAt !== 'string') return undefined;
  const ends = Date.parse(expiresAt);
  if (Number.isNaN(ends) || ends - now > SIGN_IN_WARNING_DAYS * DAY_MS) return undefined;
  return `the sign-in ends by ${expiresAt}: run claude auth login before then`;
}

const noVersion = (executable: string, ran: Ran): string =>
  ran.problem === undefined
    ? `no version from ${executable} --version`
    : `${executable} --version: ${ran.problem}`;

/**
 * `claude auth status --json` that did not run to its end (its timeout, a failed start) says so: on a busy machine it
 * runs out of time while the sign-in is fine, and "sign in" sends the owner the wrong way (fix/busy-machine).
 */
const notLoggedIn = (ran: Ran): string =>
  ran.problem === undefined
    ? 'not logged in: run `claude` once and sign in (claude auth status)'
    : `claude auth status --json: ${ran.problem}`;

export async function doctorClaude(deps: DoctorDeps): Promise<ToolInfo> {
  if (deps.executable === undefined) return { path: '', version: '', auth_ok: false, detail: NOT_FOUND };
  const launch = await launchOf(deps.executable, deps.nodePath);
  const [version, auth, hook] = await Promise.all([
    runOnce(launch, ['--version'], deps),
    runOnce(launch, ['auth', 'status', '--json'], deps),
    hookProblem(deps.hookScript),
  ]);
  const found = versionOf(version.stdout);
  const status = parseLine(auth.stdout.trim());
  const authOk = auth.code === 0 && status?.loggedIn === true;
  const ending = authOk ? signInEnding(status.loginExpiresAt, deps.now()) : undefined;
  const problems = [
    ...(found === undefined ? [noVersion(deps.executable, version)] : []),
    ...(authOk ? [] : [notLoggedIn(auth)]),
    ...(ending === undefined ? [] : [ending]),
    ...(hook === undefined ? [] : [hook]),
  ];
  return {
    path: deps.executable,
    version: found ?? '',
    auth_ok: authOk && hook === undefined,
    ...(problems.length === 0 ? {} : { detail: problems.join('; ') }),
  };
}
