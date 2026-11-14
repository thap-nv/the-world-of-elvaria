// doctor(): which Codex CLI, which version, signed in or not (spike Codex 2026-11-12 §1.1, §1.2), 0 mana:
// `codex --version` and `codex login status`, which answers `Logged in using ChatGPT` with exit 0; a call stopped at
// its timeout says so, not "not signed in" (fix/busy-machine). A session also needs the built hook
// (packages/hooks/dist): without it every hook call fails, so doctor says so, as every tribe's does (runner-core).
import { hookProblem, runToEnd } from '@elvaria/runner-core';
import type { ChildRun, ToolInfo } from '@elvaria/runner-core';

import { programOf, versionOf } from './launch.ts';
import type { Launch } from './launch.ts';

export interface DoctorInput {
  readonly launch: Launch;
  /** `hookCommand()` of @elvaria/hooks: its script is the built hook. */
  readonly hook: Launch;
  readonly env: Readonly<Record<string, string>>;
  readonly timeout_ms: number;
}

export const NOT_SIGNED_IN = 'codex login status: not signed in (run codex login), or offline';

/** The hook's script among its arguments: the one that ends in `.js`, `.mjs` or `.ts` (the source, in the specs). */
const scriptOf = (hook: Launch): string | undefined => hook.args.find((arg) => /\.(?:m?js|ts)$/i.test(arg));

/**
 * `codex login status` that did not run to its end (stopped at its timeout, never started) says so: on a busy machine
 * it runs out of time while the sign-in is fine, and "run codex login" sends the owner the wrong way (fix/busy-machine).
 */
function loginProblems(login: ChildRun): string[] {
  if (login.problem !== undefined) return [`codex login status: ${login.problem}`];
  const signedIn = login.code === 0 && /logged in/i.test(`${login.stdout}\n${login.stderr}`);
  return signedIn ? [] : [NOT_SIGNED_IN];
}

export async function doctorCodex(input: DoctorInput): Promise<ToolInfo> {
  const call = { env: input.env, timeout_ms: input.timeout_ms };
  const program = programOf(input.launch);
  const [version, login] = await Promise.all([
    runToEnd(program, ['--version'], call),
    runToEnd(program, ['login', 'status'], call),
  ]);
  const hook = await hookProblem(scriptOf(input.hook));
  const problems = [...loginProblems(login), ...(hook === undefined ? [] : [hook])];
  // A version that did not come is noted; it says nothing of whether a session can run.
  const notes = [
    ...(version.problem === undefined ? [] : [`codex --version: ${version.problem}`]),
    ...problems,
  ];
  return {
    path: input.launch.command,
    version: versionOf(version.stdout) ?? 'unknown',
    auth_ok: problems.length === 0,
    ...(notes.length === 0 ? {} : { detail: notes.join('; ') }),
  };
}
