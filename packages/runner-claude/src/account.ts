// One tribe, one account (PS-27, ADR 0021; spike claude-config-dir-2026-11-17): Claude Code keeps its sign-in,
// transcripts and settings in the folder CLAUDE_CONFIG_DIR names, so a tribe whose `tool.config_dir` names one runs
// every process there: sessions, `/usage`, the ping, `auth status`, `purge`. The adapter alone sets the variable,
// last, and removes it for a tribe that names none, so neither the host's env nor a treasury secret moves a session
// to another account. Nothing here reads or writes inside the folder; the CLI does.
import { createHash } from 'node:crypto';

import { doctorNoteOf } from '@elvaria/runner-core';
import type { DoctorNote, ToolInfo } from '@elvaria/runner-core';

import { textOf } from './json.ts';
import type { JsonObject } from './json.ts';

/** The variable Claude Code reads its config folder from; no flag of the CLI changes it (spike, 2.1.325). */
export const CONFIG_DIR_VAR = 'CLAUDE_CONFIG_DIR';

/**
 * `env` with CLAUDE_CONFIG_DIR set to the tribe's folder, or without it when the tribe names none. Any spelling of the
 * name goes first: Windows reads names without case, so `claude_config_dir` would do the same.
 */
export function accountEnv(
  env: Readonly<Record<string, string>>,
  configDir: string | undefined,
): Record<string, string> {
  const rest = Object.fromEntries(
    Object.entries(env).filter(([name]) => name.toUpperCase() !== CONFIG_DIR_VAR),
  );
  return configDir === undefined ? rest : { ...rest, [CONFIG_DIR_VAR]: configDir };
}

/** A folder as two paths of one machine compare: `/`, none at the end, lower case where the file system ignores it. */
function folderKey(dir: string, platform: NodeJS.Platform): string {
  const slashed = dir.replaceAll('\\', '/').replace(/\/+$/, '');
  return platform === 'win32' || platform === 'darwin' ? slashed.toLowerCase() : slashed;
}

/** What `auth status --json` says of the account, and the note when the CLI ran in another folder than given. */
export interface AccountSaid {
  readonly info: Pick<ToolInfo, 'config_dir' | 'account'>;
  readonly ignored?: DoctorNote;
}

/**
 * The account of `claude auth status --json` (2.1.325: `configDirectory` signed in or not, `email` and `orgId` once
 * signed in). `account` is a SHA-256 of the email, a newline and the org id, so doctor compares two tribes without
 * the email leaving this function: not in a note, a log, an event or kingdom.json. A CLI that reports another folder
 * than the tribe names did not hear the variable, and every session would run on the wrong account.
 */
export function accountOf(
  status: JsonObject | undefined,
  configDir: string | undefined,
  platform: NodeJS.Platform,
): AccountSaid {
  const used = textOf(status, 'configDirectory');
  const email = textOf(status, 'email');
  const org = textOf(status, 'orgId') ?? '';
  const account =
    email === undefined ? undefined : createHash('sha256').update(`${email}\n${org}`).digest('hex');
  const info = {
    ...(used === undefined ? {} : { config_dir: used }),
    ...(account === undefined ? {} : { account }),
  };
  const ignored =
    configDir !== undefined &&
    used !== undefined &&
    folderKey(used, platform) !== folderKey(configDir, platform);
  return ignored
    ? { info, ignored: doctorNoteOf('doctor:config_dir_ignored', { given: configDir, used }) }
    : { info };
}
