// The treasury in the Steward's hands (implementation-plan §3.9 "(P1-10)", ADR 0013), kept apart from the session
// functions it serves: the env of a session (the minimal env, the hook's context, exactly the quest's secrets), the
// values each running session was given, and what a session leaves behind masked with them before the kingdom
// keeps it. Each part is called from one place: sessionEnvOf by requestOf, rememberSecrets by spawnFor,
// maskFinished by the tick before settle.
import { secretsBeyond } from '@elvaria/domain';
import { createRedactor, redactDeep } from '@elvaria/eventlog';
import { secretValuesOf, sessionEnv } from '@elvaria/runner-core';
import { redactHandover } from '@elvaria/store';
import type { Quest, Territory } from '@elvaria/domain';
import type { RunResult, RunningSession, SpawnRequest } from '@elvaria/runner-core';

import type { Context } from '../context.ts';
import type { Finished } from './running.ts';

/**
 * The whole env of a session: the minimal env the Steward was given, `context` (the `ELVARIA_*` of envOf), and the
 * quest's `secrets_required` from the treasury. A name the territory no longer allows, or the treasury lacks,
 * throws: spawnFor reports it and opens no session.
 */
export async function sessionEnvOf(
  ctx: Context,
  input: { readonly quest: Quest; readonly territory: Territory },
  context: Readonly<Record<string, string>>,
): Promise<Record<string, string>> {
  const { quest, territory } = input;
  const refused = secretsBeyond(quest.secrets_required, territory);
  if (refused.length > 0)
    throw new Error(`territory ${territory.id} does not allow the secrets ${refused.join(', ')}`);
  const secrets = await ctx.deps.treasury.resolve(quest.secrets_required);
  return sessionEnv({ base: ctx.deps.env, context, secrets });
}

/**
 * The secret values in each running session's env, beside the session rather than in its `Running` record. Weak:
 * an entry goes with its session.
 */
const given = new WeakMap<RunningSession, readonly string[]>();

/** Remembers the values `request` handed `session`, for maskFinished. */
export function rememberSecrets(session: RunningSession, request: SpawnRequest): void {
  given.set(session, secretValuesOf(request));
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * A session's end as the kingdom keeps it: the assignee's handover letter rewritten masked (the next prompts and
 * the owner read it), and the question (into the quest file and its event) and the verifier's output (into the
 * verdict and the `returned` prompt) masked, with the session's own values first, then the patterns.
 */
export async function maskFinished(ctx: Context, finished: Finished): Promise<Finished> {
  const { running, result } = finished;
  const known = given.get(running.session) ?? [];
  if (running.role === 'assignee') {
    try {
      await redactHandover(ctx.root, running.quest, known);
    } catch (error) {
      ctx.deps.log.warn(`steward: ${running.quest}: the handover letter was not masked: ${errorText(error)}`);
    }
  }
  const mask = createRedactor(known);
  const masked: RunResult = {
    ...result,
    ...(result.question === undefined ? {} : { question: mask(result.question) }),
    ...(result.structured === undefined ? {} : { structured: redactDeep(result.structured, mask) }),
  };
  return { running, result: masked };
}
