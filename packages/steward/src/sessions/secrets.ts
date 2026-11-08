// The treasury in the Steward's hands (implementation-plan §3.9 "(P1-10)", ADR 0013), kept apart from the session
// functions it serves: the env of a session (the minimal env, the hook's context, exactly the quest's secrets), the
// values each running session was given, and what a session leaves behind masked with them before the kingdom
// keeps it. sessionEnvOf is called by requestOf, rememberSecrets by spawnFor, secretsLacking by the openings before
// the plot (P1-06) and by startChecks, questSecretsOf by startChecks too (the checks get the session's secrets,
// P1-10b) and by the openings before the plot (its `commands.setup` gets them, P1-30), maskFinished by the tick
// before settle and by the breakers after a kill.
import { secretsBeyond } from '@elvaria/domain';
import { createRedactor, redactDeep } from '@elvaria/eventlog';
import { secretValuesOf, sessionEnv } from '@elvaria/runner-core';
import { redactHandover } from '@elvaria/store';
import type { Quest, Territory } from '@elvaria/domain';
import type { RunResult, RunningSession, SpawnRequest } from '@elvaria/runner-core';

import type { Context } from '../context.ts';
import type { Finished } from './running.ts';

/**
 * The quest's `secrets_required` from the treasury, name → value: what its sessions, its checks (P1-10b) and its
 * plot's `commands.setup` (P1-30) are given. A name the territory no longer allows, or the treasury lacks, throws;
 * a quest that asks for none reads no treasury.
 */
export async function questSecretsOf(
  ctx: Context,
  quest: Quest,
  territory: Territory,
): Promise<Record<string, string>> {
  const refused = secretsBeyond(quest.secrets_required, territory);
  if (refused.length > 0)
    throw new Error(`territory ${territory.id} does not allow the secrets ${refused.join(', ')}`);
  return quest.secrets_required.length === 0 ? {} : ctx.deps.treasury.resolve(quest.secrets_required);
}

/**
 * The whole env of a session: the minimal env the Steward was given, `context` (the `ELVARIA_*` of envOf), and the
 * quest's secrets (questSecretsOf). What questSecretsOf refuses throws: spawnFor reports it and opens no session.
 */
export async function sessionEnvOf(
  ctx: Context,
  input: { readonly quest: Quest; readonly territory: Territory },
  context: Readonly<Record<string, string>>,
): Promise<Record<string, string>> {
  const secrets = await questSecretsOf(ctx, input.quest, input.territory);
  return sessionEnv({ base: ctx.deps.env, context, secrets });
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Why no session can get the quest's secrets now, or undefined when it can: a name its territory no longer allows,
 * a name the treasury lacks, a treasury that cannot be read. Names only, never a value. Asked before the plot is
 * prepared, so such a quest goes to the infirmary instead of being claimed and released every tick (P1-06).
 */
export async function secretsLacking(
  ctx: Context,
  quest: Quest,
  territory: Territory,
): Promise<string | undefined> {
  if (quest.secrets_required.length === 0) return undefined;
  const refused = secretsBeyond(quest.secrets_required, territory);
  if (refused.length > 0) return `territory ${territory.id} does not allow the secrets ${refused.join(', ')}`;
  let held: readonly string[];
  try {
    held = await ctx.deps.treasury.names();
  } catch (error) {
    return `the treasury cannot be read: ${errorText(error)}`;
  }
  const missing = quest.secrets_required.filter((name) => !held.includes(name));
  return missing.length === 0 ? undefined : `the treasury has no ${missing.join(', ')}`;
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
