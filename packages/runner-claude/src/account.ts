// One tribe, one account (PS-27, ADR 0021; spike claude-config-dir-2026-11-17): Claude Code keeps its sign-in,
// transcripts and settings in the folder CLAUDE_CONFIG_DIR names, so a tribe whose `tool.config_dir` names one runs
// every process there: sessions, `/usage`, the ping, `auth status`, `purge`. runner-core's `configDirEnv` and
// `accountSaidOf` do the rest; this file names the variable and reads `auth status`.
import { accountSaidOf, configDirEnv, textOf } from '@elvaria/runner-core';
import type { AccountSaid, JsonObject } from '@elvaria/runner-core';

/** The variable Claude Code reads its config folder from; no flag of the CLI changes it (spike, 2.1.325). */
export const CONFIG_DIR_VAR = 'CLAUDE_CONFIG_DIR';

/** `env` with CLAUDE_CONFIG_DIR set to the tribe's folder, or without it (any spelling) when the tribe names none. */
export const accountEnv = (
  env: Readonly<Record<string, string>>,
  configDir: string | undefined,
): Record<string, string> => configDirEnv(env, CONFIG_DIR_VAR, configDir);

/**
 * The account of `claude auth status --json` (2.1.325: `configDirectory` signed in or not, `email` and `orgId` once
 * signed in): its identity is the email, a newline and the org id, which runner-core hashes before anything keeps it.
 */
export function accountOf(
  status: JsonObject | undefined,
  configDir: string | undefined,
  platform: NodeJS.Platform,
): AccountSaid {
  const email = textOf(status, 'email');
  const identity = email === undefined ? undefined : `${email}\n${textOf(status, 'orgId') ?? ''}`;
  return accountSaidOf({ used: textOf(status, 'configDirectory'), identity }, configDir, platform);
}
