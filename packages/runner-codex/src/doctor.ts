// doctor(): which Codex CLI, which version, signed in or not (spike Codex 2026-11-12 §1.1, §1.2), 0 mana:
// `codex --version` and `codex login status`, which answers `Logged in using ChatGPT` with exit 0; a call stopped at
// its timeout says so, not "not signed in" (fix/busy-machine). A session also needs the built hook
// (packages/hooks/dist): without it every hook call fails, so doctor says so, as every tribe's does (runner-core).
import { callNote, doctorNoteOf, hookNote, runToEnd } from '@elvaria/runner-core';
import type { ChildRun, DoctorNote, ToolInfo } from '@elvaria/runner-core';

import { programOf, versionOf } from './launch.ts';
import type { Launch } from './launch.ts';

export interface DoctorInput {
  readonly launch: Launch;
  /** `hookCommand()` of @elvaria/hooks: its script is the built hook. */
  readonly hook: Launch;
  readonly env: Readonly<Record<string, string>>;
  readonly timeout_ms: number;
}

/** The hook's script among its arguments: the one that ends in `.js`, `.mjs` or `.ts` (the source, in the specs). */
const scriptOf = (hook: Launch): string | undefined => hook.args.find((arg) => /\.(?:m?js|ts)$/i.test(arg));

/**
 * `codex login status` that did not run to its end (stopped at its timeout, never started) says so: on a busy machine
 * it runs out of time while the sign-in is fine, and "run codex login" sends the owner the wrong way (fix/busy-machine).
 */
function loginProblems(login: ChildRun, timeoutMs: number): DoctorNote[] {
  const command = 'codex login status';
  const ended = callNote(command, login, timeoutMs);
  if (ended !== undefined) return [ended];
  const signedIn = login.code === 0 && /logged in/i.test(`${login.stdout}\n${login.stderr}`);
  return signedIn ? [] : [doctorNoteOf('doctor:not_signed_in', { command, login: 'codex login' })];
}

export async function doctorCodex(input: DoctorInput): Promise<ToolInfo> {
  const call = { env: input.env, timeout_ms: input.timeout_ms };
  const program = programOf(input.launch);
  const [version, login] = await Promise.all([
    runToEnd(program, ['--version'], call),
    runToEnd(program, ['login', 'status'], call),
  ]);
  const hook = await hookNote(scriptOf(input.hook));
  const problems = [...loginProblems(login, input.timeout_ms), ...(hook === undefined ? [] : [hook])];
  // A version that did not come is noted; it says nothing of whether a session can run.
  const versionNote = callNote('codex --version', version, input.timeout_ms);
  const notes = [...(versionNote === undefined ? [] : [versionNote]), ...problems];
  return {
    path: input.launch.command,
    version: versionOf(version.stdout) ?? 'unknown',
    auth_ok: problems.length === 0,
    ...(notes.length === 0 ? {} : { notes }),
  };
}
