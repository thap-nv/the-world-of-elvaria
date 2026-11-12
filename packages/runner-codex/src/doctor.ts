// doctor(): which Codex CLI, which version, signed in or not (spike Codex 2026-11-12 §1.1, §1.2), 0 mana:
// `codex --version` and `codex login status`, which answers `Logged in using ChatGPT` with exit 0. A session also
// needs the built hook (packages/hooks/dist): without it every hook call fails, so doctor says so first.
import { stat } from 'node:fs/promises';

import { runToEnd } from '@elvaria/runner-core';
import type { ToolInfo } from '@elvaria/runner-core';

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
export const hookMissing = (file: string): string =>
  `the Elvaria hook is not built: ${file} is missing (run pnpm --filter @elvaria/hooks build)`;

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** The hook's script among its arguments: the one that ends in `.js`, `.mjs` or `.ts` (the source, in the specs). */
const scriptOf = (hook: Launch): string | undefined => hook.args.find((arg) => /\.(?:m?js|ts)$/i.test(arg));

export async function doctorCodex(input: DoctorInput): Promise<ToolInfo> {
  const call = { env: input.env, timeout_ms: input.timeout_ms };
  const program = programOf(input.launch);
  const [version, login] = await Promise.all([
    runToEnd(program, ['--version'], call),
    runToEnd(program, ['login', 'status'], call),
  ]);
  const script = scriptOf(input.hook);
  const signedIn = login.code === 0 && /logged in/i.test(`${login.stdout}\n${login.stderr}`);
  const problems = [
    ...(signedIn ? [] : [NOT_SIGNED_IN]),
    ...(script === undefined || (await isFile(script)) ? [] : [hookMissing(script)]),
  ];
  return {
    path: input.launch.command,
    version: versionOf(version.stdout) ?? 'unknown',
    auth_ok: problems.length === 0,
    ...(problems.length === 0 ? {} : { detail: problems.join('; ') }),
  };
}
