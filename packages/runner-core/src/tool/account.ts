// One tribe, one account (PS-27, PS-27c, ADR 0021): a CLI keeps its sign-in in the folder one variable names
// (CLAUDE_CONFIG_DIR, CODEX_HOME), so a tribe whose `tool.config_dir` names one runs every process there. The adapter
// alone sets the variable, last, and removes it for a tribe that names none, so neither the host's env nor a treasury
// secret moves a session to another account. The adapter names the variable and reads what its CLI reports; this file
// does the rest, one copy for every adapter (AH-09). Nothing here reads or writes inside the folder; the CLI does.
import { createHash } from 'node:crypto';

import { doctorNoteOf } from '../runner/doctor-notes.ts';
import type { DoctorNote } from '../runner/doctor-notes.ts';
import type { ToolInfo } from '../runner/types.ts';

/**
 * `env` with `variable` set to the tribe's folder, or without it when the tribe names none. Any spelling of the name
 * goes first: Windows reads names without case, so `claude_config_dir` would do the same.
 */
export function configDirEnv(
  env: Readonly<Record<string, string>>,
  variable: string,
  configDir: string | undefined,
): Record<string, string> {
  const rest = Object.fromEntries(Object.entries(env).filter(([name]) => name.toUpperCase() !== variable));
  return configDir === undefined ? rest : { ...rest, [variable]: configDir };
}

/** A folder as two paths of one machine compare: `/`, none at the end, lower case where the file system ignores it. */
function folderKey(dir: string, platform: NodeJS.Platform): string {
  const slashed = dir.replaceAll('\\', '/').replace(/\/+$/, '');
  return platform === 'win32' || platform === 'darwin' ? slashed.toLowerCase() : slashed;
}

/** What the CLI says of its folder and account, and the note when it ran in another folder than given. */
export interface AccountSaid {
  readonly info: Pick<ToolInfo, 'config_dir' | 'account'>;
  readonly ignored?: DoctorNote;
}

/** What an adapter read from its CLI: the folder it runs in, and what names the account once signed in. */
export interface AccountReport {
  readonly used: string | undefined;
  readonly identity: string | undefined;
}

/**
 * `account` is a SHA-256 of the identity, so doctor compares two tribes without it leaving this function: not in a
 * note, a log, an event or kingdom.json. A CLI that reports another folder than the tribe names did not hear the
 * variable, and every session would run on the wrong account.
 */
export function accountSaidOf(
  { used, identity }: AccountReport,
  configDir: string | undefined,
  platform: NodeJS.Platform,
): AccountSaid {
  const account = identity === undefined ? undefined : createHash('sha256').update(identity).digest('hex');
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
