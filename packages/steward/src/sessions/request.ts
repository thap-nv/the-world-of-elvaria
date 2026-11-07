// The SpawnRequest of a session (implementation-plan §3.7): the prompt runner-core builds from the kingdom's files,
// the tool policy of the class, the territory's laws and the role, the budget the CLI enforces, the ELVARIA_*
// context the hook reads, and the run folder `.runs/<quest>-<n>` (verifier: `/verify` below it).
import { mkdir } from 'node:fs/promises';

import { FAIL_KINDS, currentRun, runDirOf } from '@elvaria/domain';
import { buildPrompt, toolPolicyOf } from '@elvaria/runner-core';
import { inKingdom } from '@elvaria/store';
import type { Character, Quest, Role, Territory } from '@elvaria/domain';
import type { Continuation, JsonSchema, Memory, SpawnRequest } from '@elvaria/runner-core';

import {
  handoverPath,
  readDecree,
  readGazetteer,
  readHandover,
  readJournal,
  readScriptures,
} from '../files.ts';
import { verdictIdOf } from '../verdicts.ts';
import type { Context } from '../context.ts';

/**
 * The verifier's structured output (§3.2): what the verdict file takes from it. The Steward checks the result with
 * the verdict schema; selectVerifier and validateVerdict (P1-04) take this over.
 */
export const VERDICT_OUTPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['result'],
  properties: {
    result: { enum: ['pass', 'fail', 'partial'] },
    fail_kind: { enum: [...FAIL_KINDS] },
    notes: { type: 'string' },
    progress: {
      type: 'object',
      additionalProperties: false,
      required: ['checked_until'],
      properties: { checked_until: { type: 'string', minLength: 1 } },
    },
  },
};

export interface SessionInput {
  readonly role: Role;
  /** The quest as the session sees it: with its plot once a start prepared one. */
  readonly quest: Quest;
  readonly character: Character;
  readonly territory: Territory;
  readonly n: number;
  readonly cwd: string;
  /** An assignee that goes on with the quest in a fresh session (§10 question 4); null for its first session. */
  readonly continuation?: Continuation | null;
}

/** What a continuing session reads instead of a transcript (ADR 0017); the branch's git log comes with P1-07. */
async function memoryOf(ctx: Context, quest: Quest): Promise<Memory> {
  return {
    handover: await readHandover(ctx.root, quest.id),
    journal: await readJournal(ctx.root, quest.id),
    git_log: null,
  };
}

/** The verdict a returned quest comes back with, when the verifier left one (`<quest>-<n>` of the last run). */
export async function continuationOf(ctx: Context, quest: Quest): Promise<Continuation> {
  const verdict = await ctx.deps.store.verdicts.read(verdictIdOf(quest, currentRun(quest)));
  return verdict.ok && verdict.value.result === 'fail'
    ? { reason: 'returned', verdict: verdict.value }
    : { reason: 'revive' };
}

/** The context the hook reads from env (§3.6); P1-10 adds the minimal env and the allowed secrets. */
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

async function promptOf(ctx: Context, input: SessionInput) {
  const { quest, character, territory } = input;
  const base = {
    locale: ctx.world.kingdom.owner.locale,
    decree: await readDecree(ctx.root),
    quest,
    character,
    territory,
    registry: ctx.world.registry,
    scriptures: await readScriptures(ctx.root, character.id),
    gazetteer: await readGazetteer(ctx.root, territory.id),
  };
  if (input.role === 'verifier') {
    // The diff and the machine checks come with P1-07 (PlotManager, runChecks).
    const handover = await readHandover(ctx.root, quest.id);
    return buildPrompt({ ...base, role: 'verifier', handover, diff: '', checks: [] }, ctx.templates);
  }
  const continuation =
    input.continuation === undefined || input.continuation === null
      ? null
      : { ...input.continuation, ...(await memoryOf(ctx, quest)) };
  return buildPrompt(
    { ...base, role: 'assignee', skills: [], handover_path: handoverPath(ctx.root, quest.id), continuation },
    ctx.templates,
  );
}

export async function requestOf(ctx: Context, input: SessionInput): Promise<SpawnRequest> {
  const { quest, character, territory, role } = input;
  const characterClass = ctx.world.registry.classes.find(({ id }) => id === character.class);
  if (characterClass === undefined) throw new Error(`registry has no class "${character.class}"`);
  const runDir = inKingdom(ctx.root, runDirOf(quest, input.n, role));
  await mkdir(runDir, { recursive: true });
  return {
    role,
    quest,
    character,
    territory,
    cwd: input.cwd,
    prompt: await promptOf(ctx, input),
    permissions: toolPolicyOf({ role, characterClass, character, territory }),
    budget: { max_turns: ctx.world.kingdom.breakers.max_turns, max_minutes: quest.budget.max_minutes },
    env: envOf(ctx, input),
    run_dir: runDir,
    ...(role === 'verifier'
      ? { structured: VERDICT_OUTPUT_SCHEMA }
      : { handover: handoverPath(ctx.root, quest.id) }),
  };
}
