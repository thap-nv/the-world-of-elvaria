// doctor(): which Claude Code, which version, logged in or not (implementation-plan §3.7; spike P1-02). The login
// is read with `claude auth status --json` (no model call, exit 1 when logged out). A session also needs the
// built hook, `packages/hooks/dist/elvaria-hook.js`: without it every hook call fails and the runner judges each
// session broken, so doctor says so first.
import { stat } from 'node:fs/promises';

import { parseLine } from './json.ts';
import { launchOf } from './launch.ts';
import { runOnce } from './run-once.ts';
import type { RunOnceOptions } from './run-once.ts';
import type { ToolInfo } from '@elvaria/runner-core';

export interface DoctorDeps extends RunOnceOptions {
  /** The pinned or located CLI; undefined when none was found. */
  readonly executable: string | undefined;
  readonly nodePath: string;
  readonly hookScript: string;
}

const VERSION = /\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.-]+)?/;

export const NOT_FOUND =
  'Claude Code not found on PATH, in ~/.local/bin, in %APPDATA%\\npm or in a VS Code extension folder';
export const hookMissing = (file: string): string =>
  `the Elvaria hook is not built: ${file} is missing (run pnpm --filter @elvaria/hooks build)`;

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** `2.1.318 (Claude Code)` → `2.1.318`. */
export const versionOf = (stdout: string): string | undefined => VERSION.exec(stdout)?.[0];

export async function doctorClaude(deps: DoctorDeps): Promise<ToolInfo> {
  if (deps.executable === undefined) return { path: '', version: '', auth_ok: false, detail: NOT_FOUND };
  const launch = await launchOf(deps.executable, deps.nodePath);
  const [version, auth, hookBuilt] = await Promise.all([
    runOnce(launch, ['--version'], deps),
    runOnce(launch, ['auth', 'status', '--json'], deps),
    isFile(deps.hookScript),
  ]);
  const found = versionOf(version.stdout);
  const status = parseLine(auth.stdout.trim());
  const authOk = auth.code === 0 && status?.loggedIn === true;
  const problems = [
    ...(found === undefined ? [`no version from ${deps.executable} --version`] : []),
    ...(authOk ? [] : ['not logged in: run `claude` once and sign in (claude auth status)']),
    ...(hookBuilt ? [] : [hookMissing(deps.hookScript)]),
  ];
  return {
    path: deps.executable,
    version: found ?? '',
    auth_ok: authOk,
    ...(problems.length === 0 ? {} : { detail: problems.join('; ') }),
  };
}
