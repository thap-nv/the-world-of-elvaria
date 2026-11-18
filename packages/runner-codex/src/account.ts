// One tribe, one account (PS-27c, ADR 0021; spike codex-home-2026-11-17): Codex keeps its sign-in (`auth.json`), its
// state and its session rollouts in the folder CODEX_HOME names, so a tribe whose `tool.config_dir` names one runs
// every process there: sessions and `exec resume`, the hooks check before them, the probe, doctor. The adapter alone
// sets the variable, last, and removes it for a tribe that names none, so neither the host's env nor a treasury secret
// moves a session to another account; it never points it at a run's folder, where no sign-in is. Nothing here reads
// or writes inside the folder; the CLI does.
import { createHash } from 'node:crypto';

import { doctorNoteOf } from '@elvaria/runner-core';
import type { DoctorNote, ToolInfo } from '@elvaria/runner-core';

/** The variable Codex reads its home folder from (spike codex-home §1, 0.169.0-alpha.11.1). */
export const HOME_VAR = 'CODEX_HOME';

/**
 * `env` with CODEX_HOME set to the tribe's folder, or without it when the tribe names none. Any spelling of the name
 * goes first: Windows reads names without case, so `codex_home` would do the same.
 */
export function homeEnv(
  env: Readonly<Record<string, string>>,
  configDir: string | undefined,
): Record<string, string> {
  const rest = Object.fromEntries(Object.entries(env).filter(([name]) => name.toUpperCase() !== HOME_VAR));
  return configDir === undefined ? rest : { ...rest, [HOME_VAR]: configDir };
}

/** A folder as two paths of one machine compare: `/`, none at the end, lower case where the file system ignores it. */
function folderKey(dir: string, platform: NodeJS.Platform): string {
  const slashed = dir.replaceAll('\\', '/').replace(/\/+$/, '');
  return platform === 'win32' || platform === 'darwin' ? slashed.toLowerCase() : slashed;
}

const textAt = (value: unknown, key: string): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const field: unknown = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field !== '' ? field : undefined;
};

/** What the app-server says of the home and the account, and the note when Codex ran in another folder than given. */
export interface AccountSaid {
  readonly info: Pick<ToolInfo, 'config_dir' | 'account'>;
  readonly ignored?: DoctorNote;
}

/**
 * The home of `initialize` (`codexHome`, the folder Codex runs in, signed in or not) and the account of
 * `account/rateLimits/read` (`accountId` at the root, once signed in; CT17). `account` is a SHA-256 of the id, so
 * doctor compares two tribes without the id leaving this function: not in a note, a log, an event or kingdom.json. A
 * Codex that reports another home than the tribe names did not hear the variable, and every session would run on the
 * wrong account.
 */
export function accountOf(
  initialized: unknown,
  limits: unknown,
  configDir: string | undefined,
  platform: NodeJS.Platform,
): AccountSaid {
  const used = textAt(initialized, 'codexHome');
  const id = textAt(limits, 'accountId');
  const account = id === undefined ? undefined : createHash('sha256').update(id).digest('hex');
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
