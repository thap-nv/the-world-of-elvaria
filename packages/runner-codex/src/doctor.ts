// doctor(): which Codex CLI, which version, signed in or not (spike Codex 2026-11-12 §1.1, §1.2), 0 mana:
// `codex --version` and `codex login status`, which answers `Logged in using ChatGPT` with exit 0; a call stopped at
// its timeout says so, not "not signed in" (fix/busy-machine). A session also needs the built hook
// (packages/hooks/dist): without it every hook call fails, so doctor says so, as every tribe's does (runner-core).
// It also says which home and account Codex runs on, from one `codex app-server` run that calls no model, and fails
// when that home is not the tribe's (PS-27c, spike codex-home-2026-11-17).
import { callNote, doctorNoteOf, hookNote, runToEnd } from '@elvaria/runner-core';
import type { ChildRun, DoctorNote, ToolInfo } from '@elvaria/runner-core';

import { accountOf } from './account.ts';
import { askAppServer } from './app-server.ts';
import { programOf, versionOf } from './launch.ts';
import type { AccountSaid } from './account.ts';
import type { Launch } from './launch.ts';

export interface DoctorInput {
  readonly launch: Launch;
  /** `hookCommand()` of @elvaria/hooks: its script is the built hook. */
  readonly hook: Launch;
  readonly env: Readonly<Record<string, string>>;
  readonly timeout_ms: number;
  /** The tribe's home (PS-27c), already in `env` as CODEX_HOME: doctor fails when Codex reports another. */
  readonly configDir?: string | undefined;
  /** How two paths of the home compare: without case on Windows and macOS. */
  readonly platform: NodeJS.Platform;
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

interface HomeSaid extends AccountSaid {
  /** The app-server stopped at its timeout or never started: noted as any such call, never "not signed in". */
  readonly ended?: DoctorNote;
}

/**
 * `initialize` names the home (`codexHome`), then `account/rateLimits/read` the account (`accountId`, CT17). A folder
 * not signed in answers that call with an error: no account then, and `login status` already says why.
 */
async function homeOf(input: DoctorInput): Promise<HomeSaid> {
  const call = { env: input.env, timeout_ms: input.timeout_ms };
  const read = await askAppServer(input.launch, [], [{ method: 'account/rateLimits/read' }], call);
  const said = accountOf(
    read.initialized,
    read.ok ? read.results[0] : undefined,
    input.configDir,
    input.platform,
  );
  if (read.ok) return said;
  const run = {
    timed_out: read.timed_out === true,
    ...(read.failure === undefined ? {} : { failure: read.failure }),
  };
  const ended = callNote('codex app-server', run, input.timeout_ms);
  return ended === undefined ? said : { ...said, ended };
}

export async function doctorCodex(input: DoctorInput): Promise<ToolInfo> {
  const call = { env: input.env, timeout_ms: input.timeout_ms };
  const program = programOf(input.launch);
  const [version, login, home] = await Promise.all([
    runToEnd(program, ['--version'], call),
    runToEnd(program, ['login', 'status'], call),
    homeOf(input),
  ]);
  const hook = await hookNote(scriptOf(input.hook));
  // A tribe that names a home is vouched for only once Codex said it runs there; without one, an app-server that did
  // not answer is a note, as `--version`'s is.
  const vouching = input.configDir !== undefined;
  const ended = home.ended === undefined ? [] : [home.ended];
  const problems = [
    ...loginProblems(login, input.timeout_ms),
    ...(hook === undefined ? [] : [hook]),
    ...(home.ignored === undefined ? [] : [home.ignored]),
    ...(vouching ? ended : []),
  ];
  // A version that did not come is noted; it says nothing of whether a session can run.
  const versionNote = callNote('codex --version', version, input.timeout_ms);
  const notes = [
    ...(versionNote === undefined ? [] : [versionNote]),
    ...(vouching ? [] : ended),
    ...problems,
  ];
  return {
    path: input.launch.command,
    version: versionOf(version.stdout) ?? 'unknown',
    auth_ok: problems.length === 0,
    ...home.info,
    ...(notes.length === 0 ? {} : { notes }),
  };
}
