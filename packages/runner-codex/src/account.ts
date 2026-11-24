// One tribe, one account (PS-27c, ADR 0021; spike codex-home-2026-11-17): Codex keeps its sign-in (`auth.json`), its
// state and its session rollouts in the folder CODEX_HOME names, so a tribe whose `tool.config_dir` names one runs
// every process there: sessions and `exec resume`, the hooks check before them, the probe, doctor. It never points at
// a run's folder, where no sign-in is. runner-core's `configDirEnv` and `accountSaidOf` do the rest.
import { accountSaidOf, configDirEnv, isJsonObject, textOf } from '@elvaria/runner-core';
import type { AccountSaid } from '@elvaria/runner-core';

/** The variable Codex reads its home folder from (spike codex-home §1, 0.169.0-alpha.11.1). */
export const HOME_VAR = 'CODEX_HOME';

/** `env` with CODEX_HOME set to the tribe's folder, or without it (any spelling) when the tribe names none. */
export const homeEnv = (
  env: Readonly<Record<string, string>>,
  configDir: string | undefined,
): Record<string, string> => configDirEnv(env, HOME_VAR, configDir);

/** A non-empty string at `key` of an answer whose shape is not trusted. */
const nonEmpty = (value: unknown, key: string): string | undefined => {
  const text = isJsonObject(value) ? textOf(value, key) : undefined;
  return text === '' ? undefined : text;
};

/**
 * The home of `initialize` (`codexHome`, the folder Codex runs in, signed in or not) and the account of
 * `account/rateLimits/read` (`accountId` at the root, once signed in; CT17), hashed by runner-core.
 */
export function accountOf(
  initialized: unknown,
  limits: unknown,
  configDir: string | undefined,
  platform: NodeJS.Platform,
): AccountSaid {
  return accountSaidOf(
    { used: nonEmpty(initialized, 'codexHome'), identity: nonEmpty(limits, 'accountId') },
    configDir,
    platform,
  );
}
