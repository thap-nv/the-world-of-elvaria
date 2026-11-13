// The SpawnRequest of a session (implementation-plan §3.7): the prompt runner-core builds from the kingdom's files
// (prompt.ts), the tool policy of the class, the territory's laws and the role, the budget the CLI enforces, the
// ELVARIA_* context the hook reads, and the run folder `.runs/<quest>-<n>` (verifier: `/verify` below it). A resumed
// session continues its CLI session (`--resume`, ADR 0017). Its load trace comes along for the opening line (PS-01b).
import { mkdir } from 'node:fs/promises';

import { FAIL_KINDS, runDirOf } from '@elvaria/domain';
import { secretValuesOf, toolPolicyOf } from '@elvaria/runner-core';
import { inKingdom } from '@elvaria/store';
import type { LoadTrace } from '@elvaria/domain';
import type { JsonSchema, SpawnRequest } from '@elvaria/runner-core';

import { handoverPath } from '../files.ts';
import { sessionGraphOf } from './graph.ts';
import { planGraphFactsOf } from './plan-graph.ts';
import { promptOf, searchFor } from './prompt.ts';
import { sessionEnvOf } from './secrets.ts';
import type { Context } from '../context.ts';
import type { Resume, SessionInput } from './input.ts';

/**
 * The verifier's structured output (§3.2): what the verdict file takes from it. The Steward adds the checks, applies
 * the ritual's pass rule, and writes it only when the verdict schema and validateVerdict accept it (review/judge.ts).
 * Notes are required of every verdict (P1-40): an agy judge's pass came with none in the P1-35 run, and the Steward
 * refuses such a pass; `breaks` are the evidence of a judge in a scratch plot (withBreaksWeighed).
 */
export const VERDICT_OUTPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['result', 'notes'],
  properties: {
    result: { enum: ['pass', 'fail', 'partial'] },
    fail_kind: { enum: [...FAIL_KINDS] },
    notes: { type: 'string', minLength: 1 },
    progress: {
      type: 'object',
      additionalProperties: false,
      required: ['checked_until'],
      properties: { checked_until: { type: 'string', minLength: 1 } },
    },
    breaks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['change', 'red'],
        properties: { change: { type: 'string', minLength: 1 }, red: { type: 'string', minLength: 1 } },
      },
    },
  },
};

/** The context the hook reads from env (§3.6); sessionEnvOf (secrets.ts) adds the minimal env and the secrets. */
const envOf = (ctx: Context, input: SessionInput): Record<string, string> => ({
  ELVARIA_KINGDOM: ctx.root,
  ELVARIA_QUEST: input.quest.id,
  ELVARIA_ATTEMPT: String(input.n),
  ELVARIA_CHARACTER: input.character.id,
  ELVARIA_ROLE: input.role,
  ELVARIA_TRIBE: input.character.tribe,
  ELVARIA_MODEL: input.character.model,
  ELVARIA_TZ: ctx.world.kingdom.tz,
});

/** The request the runner gets, and what its prompt carried, for the line that opens the session. */
export interface SessionRequest {
  readonly request: SpawnRequest;
  readonly load_trace: LoadTrace;
}

export async function requestOf(
  ctx: Context,
  input: SessionInput,
  resume: Resume | null = null,
): Promise<SessionRequest> {
  const { quest, character, territory, role } = input;
  const characterClass = ctx.world.registry.classes.find(({ id }) => id === character.class);
  if (characterClass === undefined) throw new Error(`registry has no class "${character.class}"`);
  const runDir = inKingdom(ctx.root, runDirOf(quest, input.n, role));
  await mkdir(runDir, { recursive: true });
  const graph = await sessionGraphOf(ctx, quest, territory);
  const own = await sessionEnvOf(ctx, input, envOf(ctx, input));
  // GRAPHIFY_OUT names the quest's graph, so no command names one (PS-21); graphify's folder goes first on PATH.
  const env =
    graph === undefined || ctx.deps.graphs === undefined ? own : ctx.deps.graphs.envFor(own, graph.dir);
  const known = secretValuesOf({ quest, env });
  // A plan quest's mage reads the impact of its scope, its judge the sub-quests the graph links (PS-21b).
  const { impact, plan_links: planLinks } = await planGraphFactsOf(ctx, input, graph);
  const given = {
    characterClass,
    known,
    ...(graph === undefined
      ? {}
      : { graph: { commit: graph.commit, ...(impact === undefined ? {} : { impact }) } }),
    ...(planLinks === undefined ? {} : { plan_links: planLinks }),
  };
  const { prompt, load_trace: loadTrace } = await promptOf(ctx, input, given, resume);
  const request: SpawnRequest = {
    role,
    quest,
    character,
    territory,
    cwd: input.cwd,
    prompt,
    permissions: toolPolicyOf({
      role,
      characterClass,
      character,
      territory,
      scratch: input.scratch === true,
      exclusive: input.exclusive !== false,
      cli_search: searchFor(ctx, character),
      graph: graph !== undefined,
    }),
    budget: { max_turns: ctx.world.kingdom.breakers.max_turns, max_minutes: quest.budget.max_minutes },
    env,
    run_dir: runDir,
    ...(role === 'verifier'
      ? { structured: VERDICT_OUTPUT_SCHEMA }
      : { handover: handoverPath(ctx.root, quest.id) }),
    ...(resume === null ? {} : { resume: { session_id: resume.session_id } }),
  };
  return { request, load_trace: loadTrace };
}
