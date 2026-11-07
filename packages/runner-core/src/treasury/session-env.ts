// The whole env of one session (implementation-plan §3.9, ADR 0013): the minimal env, the `ELVARIA_*` context the
// hook reads, and exactly the secrets the quest asks for. And, from a request, which of its env variables are
// secrets: their names go to the hook in policy.json, their values to every redactor of the session, so a value
// the treasury holds is masked even when no pattern knows its shape.
import { createRedactor } from '@elvaria/eventlog';
import type { Redactor } from '@elvaria/eventlog';

import { childEnvOf } from '../process/program.ts';
import { secretEnvName } from './treasury.ts';
import type { SpawnRequest } from '../runner/types.ts';

export interface SessionEnvInput {
  /** The minimal env (minimalEnv), built by the composition root. */
  readonly base: Readonly<Record<string, string>>;
  /** `ELVARIA_*`. */
  readonly context: Readonly<Record<string, string>>;
  /** Treasury name → value, for the names of `quest.secrets_required` only. */
  readonly secrets: Readonly<Record<string, string>>;
}

/** Prefixes no secret may take: Elvaria's context and git's (a GIT_* variable points git at another repo, §6). */
const RESERVED = /^(ELVARIA_|GIT_)/i;

/**
 * The env of the child. A secret whose variable would replace one of the base or the context (a treasury name
 * `path`, `elvaria_quest`) is refused rather than let it change how the session runs.
 */
export function sessionEnv(input: SessionEnvInput): Record<string, string> {
  const env: Record<string, string> = { ...childEnvOf(input.base), ...input.context };
  const taken = new Set(Object.keys(env).map((name) => name.toUpperCase()));
  for (const [name, value] of Object.entries(input.secrets)) {
    const variable = secretEnvName(name);
    if (RESERVED.test(variable) || taken.has(variable))
      throw new Error(`secret ${name} would replace the variable ${variable}; rename it in the treasury`);
    env[variable] = value;
  }
  return env;
}

/** The env names of the secrets a session was given: its quest's `secrets_required`; none without a quest. */
export const secretEnvNamesOf = (req: Pick<SpawnRequest, 'quest'>): string[] =>
  (req.quest?.secrets_required ?? []).map(secretEnvName);

/** Their values in the request's env: what every redactor of the session masks before the patterns. */
export const secretValuesOf = (req: Pick<SpawnRequest, 'quest' | 'env'>): string[] =>
  secretEnvNamesOf(req).flatMap((name) => {
    const value = req.env[name];
    return value === undefined || value === '' ? [] : [value];
  });

/** The session's values, then the patterns: for a text an adapter keeps in the run folder (Claude's prompt.md). */
export const sessionRedactor = (req: Pick<SpawnRequest, 'quest' | 'env'>): Redactor =>
  createRedactor(secretValuesOf(req));
