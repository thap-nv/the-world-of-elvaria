// The SpawnRequest of a session (implementation-plan §3.7): the prompt runner-core builds from the kingdom's files,
// the tool policy of the class, the territory's laws and the role, the budget the CLI enforces, the ELVARIA_*
// context the hook reads, and the run folder `.runs/<quest>-<n>` (verifier: `/verify` below it).
import { mkdir } from 'node:fs/promises';
import process from 'node:process';

import {
  FAIL_KINDS,
  currentRun,
  isEventOf,
  ownerVerdictIdOf,
  partialVerdictIdOf,
  runDirOf,
  shellOf,
  verdictIdOf,
  verifierSessionsOf,
} from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { buildPrompt, readContextFiles, secretValuesOf, toolPolicyOf } from '@elvaria/runner-core';
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
  /** A verifier in the scratch plot its trial made (ADR 0022, P1-20): Edit and Write there, no commit, no push. */
  readonly scratch?: boolean;
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
 * What the branch touched as the session opens, by which the prompt names the checks the machine will run on the work
 * (P1-43, (d) of P1-37). A plot that cannot be read gives nothing: the session opens without that section.
 */
async function touchedOf(ctx: Context, quest: Quest): Promise<Pick<Continuation, 'touched'>> {
  try {
    return { touched: await ctx.deps.plots.touched(quest.plot) };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    ctx.deps.log.warn(`steward: ${quest.id}: what the branch touched is unknown: ${why}`);
    return {};
  }
}

/**
 * What a continuing assignee reads: the letter, the journal, the checks ahead of its work and, after a return, the
 * checks of the verdict with the end of each failing one's log, masked with `known`: the assignee cannot read `.runs/`
 * either (P1-10b).
 */
async function continuationFor(
  ctx: Context,
  input: SessionInput,
  known: readonly string[],
): Promise<(Continuation & Memory) | null> {
  const { continuation, quest } = input;
  if (continuation === undefined || continuation === null) return null;
  const memory = { ...(await memoryOf(ctx, quest)), ...(await touchedOf(ctx, quest)) };
  if (continuation.reason === 'revive') return { ...continuation, ...memory };
  const checks = await withLogTails(ctx.root, continuation.verdict.checks, known);
  return { ...continuation, ...memory, checks };
}

/**
 * The territory's law and rules as they stand in the plot, for a tribe whose CLI loads no context file (§3.14
 * `context: prompt`, P1-33); nothing for one that loads them, or they would come twice.
 */
async function contextFilesFor(ctx: Context, input: SessionInput) {
  if (ctx.limits[input.character.tribe]?.context !== 'prompt') return {};
  return { context_files: await readContextFiles(input.cwd, input.territory.context_files) };
}

/**
 * The shell the session's commands run in on this OS, as the tribe's adapter declares it (P1-40): a fact of the
 * system the prompt states, where the kingdom's scripture used to say it for the gemini tribe on Windows only.
 */
const shellFor = (ctx: Context, character: Character): string | undefined =>
  shellOf(ctx.deps.runners[character.tribe]?.capabilities, ctx.deps.platform ?? process.platform);

/**
 * Whether the tribe's CLI searches files on its own (P1-53): false gives a class with Glob or Grep the search
 * commands, in its tool policy and its prompt alike; absent, as for Claude Code, nothing changes.
 */
const searchFor = (ctx: Context, character: Character): boolean | undefined =>
  ctx.deps.runners[character.tribe]?.capabilities.search;

/** `known`: the session's secret values, masked in what the prompt quotes of the kingdom's logs (P1-25). */
async function promptOf(
  ctx: Context,
  input: SessionInput,
  characterClass: CharacterClass,
  known: readonly string[],
) {
  const { quest, character, territory } = input;
  const base = {
    shell: shellFor(ctx, character),
    cli_search: searchFor(ctx, character),
    locale: ctx.world.kingdom.owner.locale,
    decree: await readDecree(ctx.root),
    quest,
    character,
    territory,
    registry: ctx.world.registry,
    scriptures: await readScriptures(ctx.root, character.id),
    gazetteer: await readGazetteer(ctx.root, territory.id),
    class_prompt: await readClassPrompt(ctx.root, characterClass),
    ...(await contextFilesFor(ctx, input)),
  };
  if (input.role === 'verifier') {
    // The branch's diff against its fork point (PlotManager.diff, P1-15); a plot without git has none to give. A
    // party's merge quest gives its own work only, after its last merge: each part was judged already (P1-21 (e)).
    const handover = await readHandover(ctx.root, quest.id);
    // The end of each failing check's log: the judge cannot read `.runs/` (P1-25).
    const checks = await withLogTails(ctx.root, input.checks ?? [], known);
    const diff = await ctx.deps.plots.diff(
      quest.plot,
      quest.party_role === 'merge' ? 'after_merges' : 'branch',
    );
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
    permissions: toolPolicyOf({
      role,
      characterClass,
      character,
      territory,
      scratch: input.scratch === true,
      cli_search: searchFor(ctx, character),
    }),
    budget: { max_turns: ctx.world.kingdom.breakers.max_turns, max_minutes: quest.budget.max_minutes },
    env,
    run_dir: runDir,
    ...(role === 'verifier'
      ? { structured: VERDICT_OUTPUT_SCHEMA }
      : { handover: handoverPath(ctx.root, quest.id) }),
  };
}
