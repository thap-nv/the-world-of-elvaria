// The prompt of a session (implementation-plan §3.7): runner-core's buildPrompt over what the kingdom's files say of
// the quest, the character, its class and the territory, plus what the role reads: a judge the letter, the checks
// and the diff, a continuing assignee its continuation (continuation.ts). A resumed session gets only what is new
// (resumedPrompt, ADR 0017). With it comes its load trace (PS-01b, load-trace.ts), for the line that opens it.
import process from 'node:process';

import { partialVerdictIdOf, shellOf, verifierSessionsOf } from '@elvaria/domain';
import { buildPrompt, readContextFiles, resumedPrompt } from '@elvaria/runner-core';
import { readClassPrompt } from '@elvaria/store';
import type { Character, CharacterClass, LoadTrace, Quest, Skill, Verdict } from '@elvaria/domain';
import type { BuiltPrompt, PromptGraph, PromptWithBlocks } from '@elvaria/runner-core';

import { handoverPath, readDecree, readHandover, readScriptures } from '../files.ts';
import { objectionFor } from '../memos/objection.ts';
import { gazetteerFor } from './gazetteer.ts';
import { withLogTails } from '../review/log-tail.ts';
import { continuationFor } from './continuation.ts';
import { loadTraceOf } from './load-trace.ts';
import { outOfScopeIn } from './out-of-scope.ts';
import type { Context } from '../context.ts';
import type { Scripture } from '../files.ts';
import type { Resume, SessionInput } from './input.ts';

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
export const searchFor = (ctx: Context, character: Character): boolean | undefined =>
  ctx.deps.runners[character.tribe]?.capabilities.search;

/** What builtPromptOf reads beside the session's input: its class, its secret values, its scriptures and skills. */
interface PromptParts {
  readonly characterClass: CharacterClass;
  /** The session's secret values, masked in what the prompt quotes of the kingdom's logs (P1-25). */
  readonly known: readonly string[];
  readonly scriptures: readonly Scripture[];
  /** Chosen by selectSkills (§3.13); none in stage 1. */
  readonly skills: readonly Skill[];
  /** The quest's code graph, when the session asks one (PS-21, sessionGraphOf). */
  readonly graph?: PromptGraph | undefined;
}

async function builtPromptOf(
  ctx: Context,
  input: SessionInput,
  parts: PromptParts,
): Promise<PromptWithBlocks> {
  const { quest, character, territory } = input;
  const { known } = parts;
  const base = {
    shell: shellFor(ctx, character),
    cli_search: searchFor(ctx, character),
    locale: ctx.world.kingdom.owner.locale,
    // A plan quest's drafting rules quote it (PS-06).
    context_budget_tokens: ctx.world.kingdom.breakers.context_budget_tokens,
    decree: await readDecree(ctx.root),
    quest,
    character,
    territory,
    registry: ctx.world.registry,
    scriptures: parts.scriptures.map(({ text }) => text),
    gazetteer: await gazetteerFor(ctx, quest, territory),
    class_prompt: await readClassPrompt(ctx.root, parts.characterClass),
    ...(await contextFilesFor(ctx, input)),
    ...(parts.graph === undefined ? {} : { graph: parts.graph }),
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
    // The files changed outside the quest's scope (PS-05): the judge weighs them, the machine never fails them.
    const outside = await outOfScopeIn(ctx, quest);
    // A second judge reads the verdict the assignee contests and its objection (PS-22).
    const objection = await objectionFor(ctx, quest);
    return buildPrompt(
      { ...base, role: 'verifier', handover, diff, checks, partial, out_of_scope: outside, objection },
      ctx.templates,
    );
  }
  const continuation = await continuationFor(ctx, input, known);
  return buildPrompt(
    {
      ...base,
      role: 'assignee',
      skills: parts.skills,
      handover_path: handoverPath(ctx.root, quest.id),
      continuation,
    },
    ctx.templates,
  );
}

/** The prompt the session gets, and its load trace (PS-01b): what that prompt carried. */
export interface SessionPrompt {
  readonly prompt: BuiltPrompt;
  readonly load_trace: LoadTrace;
}

/**
 * The prompt of the session, cut down when it resumes a CLI session (`resume`, ADR 0017). Its blocks go into the load
 * trace, not to the CLI: the request's prompt is the system and the user part alone.
 */
export async function promptOf(
  ctx: Context,
  input: SessionInput,
  given: Pick<PromptParts, 'characterClass' | 'known' | 'graph'>,
  resume: Resume | null,
): Promise<SessionPrompt> {
  const parts = { ...given, scriptures: await readScriptures(ctx.root, input.character.id), skills: [] };
  const built = await builtPromptOf(ctx, input, parts);
  const prompt = resume === null ? built : resumedPrompt(built, resume.answered, ctx.templates);
  const skills = parts.skills.map(({ id }) => id);
  return {
    prompt: { system: prompt.system, user: prompt.user },
    load_trace: loadTraceOf(prompt, parts.scriptures, skills),
  };
}
