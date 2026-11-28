// The SpawnRequest of a session (implementation-plan §3.7): the prompt runner-core builds from the kingdom's files
// (prompt.ts), the tool policy of the class, the territory's laws and the role, the budget the CLI enforces, the
// ELVARIA_* context the hook reads, and the run folder `.runs/<quest>-<n>` (verifier: `/verify` below it). A resumed
// session continues its CLI session (`--resume`, ADR 0017). Its load trace comes along for the opening line (PS-01b).
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { FAIL_KINDS, calibrationOf, healDueIn, judgedByEye, runDirOf, turnCeilingOf } from '@elvaria/domain';
import { screensOf, secretValuesOf, toolPolicyOf } from '@elvaria/runner-core';
import { inKingdom } from '@elvaria/store';
import type { LoadTrace, Memo } from '@elvaria/domain';
import type { JsonSchema, Screens, SpawnRequest } from '@elvaria/runner-core';

import { narrowChecksFor } from '../review/check-mode.ts';
import { handoverPath } from '../texts/files.ts';
import { sessionGraphOf } from './graph.ts';
import type { SessionGraph } from './graph.ts';
import { planGraphFactsOf } from './plan-graph.ts';
import { promptOf, searchFor } from './prompt.ts';
import { sessionEnvOf } from './secrets.ts';
import type { Context } from '../context.ts';
import type { Resume, SessionInput } from './input.ts';

const PERCENT = 100;

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

/**
 * The budget the CLI enforces is the hard ceiling of the domain (F): the holder's tribe's turn ceiling and the quest's
 * minutes, both at `hard_pct`, so the CLI never cuts a session before the Steward's own hard cut, nor before the
 * soft reminder. The holder is `input.character` (the quest may not name it yet when the request is built).
 */
function budgetOf(ctx: Context, input: SessionInput): SpawnRequest['budget'] {
  const { quest, character, role } = input;
  const { breakers, tribes } = ctx.world.kingdom;
  const holder = role === 'assignee' ? { assignee: character.id } : { verifier: character.id };
  const calibration = calibrationOf([...ctx.world.quests.values()], ctx.world.characters, ctx.world.kingdom);
  const turns = turnCeilingOf(
    { ...quest, ...holder },
    role,
    { ...breakers, characters: ctx.world.characters, tribes },
    calibration.get(character.tribe),
  );
  const hard = breakers.hard_pct;
  // A heal session's minutes are kingdom.heal's, as its breakers read them (ADR 0034): the doer's own after its
  // `due`, and a healer's.
  const heals = role === 'assignee' && healDueIn(quest.attempt_log, input.n);
  const minutes = heals ? ctx.world.kingdom.heal.minutes : quest.budget.max_minutes;
  return {
    max_turns: Math.round((turns * hard) / PERCENT),
    max_minutes: (minutes * hard) / PERCENT,
  };
}

/** A healer's session works in its run's `heal/` folder, as its attempt_log entry says (ADR 0034, HL-04). */
function runFolderOf(input: SessionInput): string {
  const dir = runDirOf(input.quest, input.n, input.role);
  return input.continuation?.reason === 'heal' ? `${dir}/heal` : dir;
}

/**
 * The request the runner gets, what its prompt carried, for the line that opens the session, and (PS-09c) the
 * advisories it carried, recorded as read once the session opened.
 */
export interface SessionRequest {
  readonly request: SpawnRequest;
  readonly load_trace: LoadTrace;
  readonly advisories: readonly Memo[];
}

const classOf = (ctx: Context, character: SessionInput['character']) => {
  const characterClass = ctx.world.registry.classes.find(({ id }) => id === character.class);
  if (characterClass === undefined) throw new Error(`registry has no class "${character.class}"`);
  return characterClass;
};

/**
 * The screens a judge by eye reads (PS-11b): those the run's checks left in `.runs/<quest>-<n>/screens/`, where the
 * check `screens` found them; none for any other session.
 */
async function screensFor(ctx: Context, input: SessionInput): Promise<Screens | undefined> {
  if (input.role !== 'verifier' || !judgedByEye(input.quest, ctx.world.registry)) return undefined;
  return screensOf(ctx.root, runDirOf(input.quest, input.n, 'assignee'));
}

/** What promptOf reads beside the input: the class, the secret values it masks, the graph and what it says. */
async function givenOf(
  ctx: Context,
  input: SessionInput,
  graph: SessionGraph | undefined,
  known: readonly string[],
  screens?: Screens,
) {
  // A plan quest's mage reads the impact of its scope, its judge the sub-quests the graph links (PS-21b).
  const { impact, plan_links: planLinks } = await planGraphFactsOf(ctx, input, graph);
  return {
    characterClass: classOf(ctx, input.character),
    known,
    ...(screens === undefined ? {} : { screens: screens.pairs }),
    ...(graph === undefined
      ? {}
      : { graph: { commit: graph.commit, ...(impact === undefined ? {} : { impact }) } }),
    ...(planLinks === undefined ? {} : { plan_links: planLinks }),
  };
}

/**
 * The characters of the user part of the prompt `input`'s session would get, the part agy takes on its command line
 * (review/prompt-size.ts, fix/verifier-prompt-limit). No plot, run folder or treasury: no secret value is masked, so
 * a log tail that quotes one may count a few characters more or less than the session's prompt.
 */
export async function userPromptLengthOf(ctx: Context, input: SessionInput): Promise<number> {
  const graph = await sessionGraphOf(ctx, input.quest, input.territory);
  const given = await givenOf(ctx, input, graph, [], await screensFor(ctx, input));
  const { prompt } = await promptOf(ctx, input, given, null);
  return prompt.user.length;
}

/** The places of the owner's secrets a session's tools never name (SEC-01b): the treasury, each tribe's CLI folder. */
const secretPathsOf = (ctx: Context): string[] => [
  ctx.world.kingdom.paths.treasury.startsWith('~')
    ? ctx.world.kingdom.paths.treasury
    : path.resolve(ctx.root, ctx.world.kingdom.paths.treasury),
  ...ctx.world.kingdom.tribes.flatMap(({ tool }) =>
    tool?.config_dir === undefined ? [] : [`${tool.config_dir}/**`],
  ),
];

export async function requestOf(
  ctx: Context,
  input: SessionInput,
  resume: Resume | null = null,
): Promise<SessionRequest> {
  const { quest, character, territory, role } = input;
  const characterClass = classOf(ctx, character);
  const runDir = inKingdom(ctx.root, runFolderOf(input));
  await mkdir(runDir, { recursive: true });
  const graph = await sessionGraphOf(ctx, quest, territory);
  const own = await sessionEnvOf(ctx, input, envOf(ctx, input));
  // GRAPHIFY_OUT names the quest's graph, so no command names one (PS-21); graphify's folder goes first on PATH.
  const env =
    graph === undefined || ctx.deps.graphs === undefined ? own : ctx.deps.graphs.envFor(own, graph.dir);
  const screens = await screensFor(ctx, input);
  // The judge of a narrow run: its shell and its law 3 follow that run (CM-01).
  const narrow = await narrowChecksFor(ctx, input);
  const given = {
    ...(await givenOf(ctx, input, graph, secretValuesOf({ quest, env }), screens)),
    ...(narrow === undefined ? {} : { narrow_checks: narrow }),
  };
  const { prompt, load_trace: loadTrace, advisories } = await promptOf(ctx, input, given, resume);
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
      secret_paths: secretPathsOf(ctx),
      character,
      territory,
      scratch: input.scratch === true,
      exclusive: input.exclusive !== false,
      cli_search: searchFor(ctx, character),
      graph: graph !== undefined,
      // Exactly the screens its prompt lists, outside the plot (PS-11b): never the run folder.
      images: screens?.files,
      narrow_checks: narrow,
      // (P2-01d) Every session of a read-only quest: reading tools, its report and its letter, no shell, no web.
      read_only: quest.read_only,
    }),
    budget: budgetOf(ctx, input),
    env,
    run_dir: runDir,
    ...(role === 'verifier'
      ? { structured: VERDICT_OUTPUT_SCHEMA }
      : { handover: handoverPath(ctx.root, quest.id) }),
    ...(resume === null ? {} : { resume: { session_id: resume.session_id } }),
  };
  return { request, load_trace: loadTrace, advisories };
}
