// The SpawnRequest of a session (implementation-plan §3.7): the prompt runner-core builds from the kingdom's files,
// the tool policy of the class, the territory's laws and the role, the budget the CLI enforces, the ELVARIA_*
// context the hook reads, and the run folder `.runs/<quest>-<n>` (verifier: `/verify` below it).
import { mkdir } from 'node:fs/promises';

import {
  FAIL_KINDS,
  currentRun,
  isEventOf,
  ownerVerdictIdOf,
  partialVerdictIdOf,
  runDirOf,
  verdictIdOf,
  verifierSessionsOf,
} from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { buildPrompt, secretValuesOf, toolPolicyOf } from '@elvaria/runner-core';
import { inKingdom, readClassPrompt } from '@elvaria/store';
import type {
  Character,
  CharacterClass,
  Quest,
  Role,
  Territory,
  Verdict,
  VerdictCheck,
} from '@elvaria/domain';
import type { Continuation, JsonSchema, Memory, SpawnRequest } from '@elvaria/runner-core';

import {
  handoverPath,
  readDecree,
  readGazetteer,
  readHandover,
  readJournal,
  readScriptures,
} from '../files.ts';
import { refusedPatchOf } from '../infirmary.ts';
import { withLogTails } from '../review/log-tail.ts';
import { sessionEnvOf } from './secrets.ts';
import type { Context } from '../context.ts';

/**
 * The verifier's structured output (§3.2): what the verdict file takes from it. The Steward adds the checks, applies
 * the ritual's pass rule, and writes it only when the verdict schema and validateVerdict accept it (review/judge.ts).
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
  /** A verifier's: the machine checks that ran before its session (§3.2). */
  readonly checks?: readonly VerdictCheck[];
}

/** What a continuing session reads instead of a transcript (ADR 0017); the branch's git log comes with P1-07. */
async function memoryOf(ctx: Context, quest: Quest): Promise<Memory> {
  return {
    handover: await readHandover(ctx.root, quest.id),
    journal: await readJournal(ctx.root, quest.id),
    git_log: null,
  };
}

/**
 * Why the Steward refused the patch of run `n` (P1-31), from that run's `quest.infirmary` line in the quest's journal:
 * the quest file keeps no reason. A run ends once, so one line at most says so; a later infirmary of the same run
 * (its secrets gone at the next claim) says something else. A journal that cannot be read tells nothing.
 */
async function refusedPatchOfRun(ctx: Context, quest: Quest, n: number): Promise<string | undefined> {
  try {
    const { events } = await openJournal(ctx.root, quest.id).read();
    for (const event of events) {
      if (!isEventOf(event, 'quest.infirmary') || event.attempt !== n) continue;
      const why = refusedPatchOf(event.data);
      if (why !== undefined) return why;
    }
  } catch {
    // Nothing to tell: the session reads its letter and journal as after any revival.
  }
  return undefined;
}

/**
 * The verdict a returned quest comes back with: the owner's return (`<quest>-<n>-user`), else the judge's or the
 * machine's fail (`<quest>-<n>`) on the last run; a crash returns with none. Either says why the last run's patch
 * was refused, when it was (P1-31).
 */
export async function continuationOf(ctx: Context, quest: Quest): Promise<Continuation> {
  const n = currentRun(quest);
  const why = await refusedPatchOfRun(ctx, quest, n);
  const refused = why === undefined ? {} : { refused_patch: why };
  for (const id of [ownerVerdictIdOf(quest, n), verdictIdOf(quest, n)]) {
    const verdict = await ctx.deps.store.verdicts.read(id);
    if (verdict.ok && verdict.value.result === 'fail')
      return { reason: 'returned', verdict: verdict.value, ...refused };
  }
  return { reason: 'revive', ...refused };
}

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
 * The `partial` verdict the latest judge of run `n` left (`<quest>-<n>-p<k>`, §3.2), so the next judge reads on from
 * where it stopped; null when no judge of this run stopped part-way. A session that crashed left none: the one
 * before it may have.
 */
export async function lastPartialOf(ctx: Context, quest: Quest, n: number): Promise<Verdict | null> {
  for (let k = verifierSessionsOf(quest, n); k >= 1; k -= 1) {
    const verdict = await ctx.deps.store.verdicts.read(partialVerdictIdOf(quest, n, k));
    if (verdict.ok && verdict.value.result === 'partial') return verdict.value;
  }
  return null;
}

/**
 * What a continuing assignee reads: the letter, the journal and, after a return, the checks of the verdict with the
 * end of each failing one's log, masked with `known`: the assignee cannot read `.runs/` either (P1-10b).
 */
async function continuationFor(
  ctx: Context,
  input: SessionInput,
  known: readonly string[],
): Promise<(Continuation & Memory) | null> {
  const { continuation, quest } = input;
  if (continuation === undefined || continuation === null) return null;
  const memory = await memoryOf(ctx, quest);
  if (continuation.reason === 'revive') return { ...continuation, ...memory };
  const checks = await withLogTails(ctx.root, continuation.verdict.checks, known);
  return { ...continuation, ...memory, checks };
}

/** `known`: the session's secret values, masked in what the prompt quotes of the kingdom's logs (P1-25). */
async function promptOf(
  ctx: Context,
  input: SessionInput,
  characterClass: CharacterClass,
  known: readonly string[],
) {
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
    class_prompt: await readClassPrompt(ctx.root, characterClass),
  };
  if (input.role === 'verifier') {
    // The branch's diff against its fork point (PlotManager.diff, P1-15); a plot without git has none to give.
    const handover = await readHandover(ctx.root, quest.id);
    // The end of each failing check's log: the judge cannot read `.runs/` (P1-25).
    const checks = await withLogTails(ctx.root, input.checks ?? [], known);
    const diff = await ctx.deps.plots.diff(quest.plot);
    const partial = await lastPartialOf(ctx, quest, input.n);
    return buildPrompt({ ...base, role: 'verifier', handover, diff, checks, partial }, ctx.templates);
  }
  const continuation = await continuationFor(ctx, input, known);
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
  const env = await sessionEnvOf(ctx, input, envOf(ctx, input));
  return {
    role,
    quest,
    character,
    territory,
    cwd: input.cwd,
    prompt: await promptOf(ctx, input, characterClass, secretValuesOf({ quest, env })),
    permissions: toolPolicyOf({ role, characterClass, character, territory }),
    budget: { max_turns: ctx.world.kingdom.breakers.max_turns, max_minutes: quest.budget.max_minutes },
    env,
    run_dir: runDir,
    ...(role === 'verifier'
      ? { structured: VERDICT_OUTPUT_SCHEMA }
      : { handover: handoverPath(ctx.root, quest.id) }),
  };
}
