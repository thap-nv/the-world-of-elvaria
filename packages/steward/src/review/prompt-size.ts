// The judges' prompts for the reviews about to be judged, measured before the tick (fix/verifier-prompt-limit,
// ADR 0021): planTick passes over a judge whose tribe takes a shorter prompt on this OS (selectVerifier), where in the
// PS-07 run the Steward chose an agy judge whose session could not open. Only a judge of a tribe with such a limit is
// measured (agy on Windows: `capabilities.prompt_max_chars`, in ctx.limits), only for a quest in review whose checks
// ended, and once per review: the length is kept until the quest, its checks or the judge change. A kingdom without
// such a tribe measures nothing.
import { currentRun } from '@elvaria/domain';
import type { Character, Quest, ReviewPrompt } from '@elvaria/domain';

import { userPromptLengthOf } from '../sessions/request.ts';
import { inScratch } from './scratch.ts';
import type { CheckedRun } from '../background.ts';
import type { Context } from '../context.ts';
import type { SessionInput } from '../sessions/input.ts';

/** The lengths kept between ticks, by review and judge; null: the prompt could not be built (said once in the log). */
export type PromptSizes = Map<string, number | null>;

/** The judges that may be measured: of a class that judges, not in the Temple, of a tribe with a prompt limit here. */
function limitedJudges(ctx: Context): Character[] {
  const judging = new Set(
    ctx.world.registry.classes.filter(({ is_verifier }) => is_verifier).map(({ id }) => id),
  );
  return [...ctx.world.characters.values()].filter(
    (character) =>
      judging.has(character.class) &&
      character.status !== 'suspended' &&
      ctx.limits[character.tribe]?.prompt_max_chars !== undefined,
  );
}

/** The ended checks of a quest that waits for a judge, as its judge will read them; undefined for any other quest. */
function dueReview(ctx: Context, quest: Quest): CheckedRun | undefined {
  if (quest.status !== 'review' || quest.tier !== 'session' || typeof quest.verifier === 'string')
    return undefined;
  const checked = ctx.background.ended(quest.id, currentRun(quest));
  // Checks set aside for their environment go to no judge (P1-54): nothing to measure until they run again.
  return checked?.environment === undefined ? checked : undefined;
}

const judgesKind = (ctx: Context, judge: Character, quest: Quest): boolean =>
  ctx.world.registry.classes.some(({ id, kinds }) => id === judge.class && kinds.includes(quest.kind));

/** What the judge's prompt is made of: the run, its checks, the log (a partial verdict, a judge that left), an objection. */
const keyOf = (quest: Quest, checked: CheckedRun, judge: Character): string =>
  [
    quest.id,
    currentRun(quest),
    checked.head,
    quest.attempt_log.length,
    quest.objection?.judge,
    judge.id,
  ].join('|');

/** How a prompt is measured: userPromptLengthOf, or a stand-in in the specs. */
type LengthOf = (ctx: Context, input: SessionInput) => Promise<number>;

async function measure(
  ctx: Context,
  { quest, judge, checked }: { quest: Quest; judge: Character; checked: CheckedRun },
  lengthOf: LengthOf,
): Promise<number | null> {
  const territory = ctx.world.territories.get(quest.territory);
  if (territory === undefined) return null;
  const input = {
    role: 'verifier',
    quest,
    character: judge,
    territory,
    n: currentRun(quest),
    // The judge's context files are read from here only for a tribe without a context file (§3.14 `context: prompt`).
    cwd: quest.plot.path ?? territory.path,
    checks: checked.checks,
    scratch: inScratch(ctx, quest),
  } as const;
  try {
    return await lengthOf(ctx, input);
  } catch (error) {
    // The session would fail the same way when it opens: the log says why there, and the judge is not passed over.
    const message = error instanceof Error ? error.message : String(error);
    ctx.deps.log.warn(`steward: ${quest.id}: cannot measure ${judge.id}'s prompt: ${message}`);
    return null;
  }
}

/** The prompt of each measured judge for each quest about to be judged; `sizes` keeps them for the next tick. */
export async function reviewPromptsOf(
  ctx: Context,
  sizes: PromptSizes,
  lengthOf: LengthOf = userPromptLengthOf,
): Promise<ReviewPrompt[]> {
  const kept = new Map(sizes);
  sizes.clear();
  const judges = limitedJudges(ctx);
  const prompts: ReviewPrompt[] = [];
  if (judges.length === 0) return prompts;
  for (const quest of ctx.world.quests.values()) {
    const checked = dueReview(ctx, quest);
    if (checked === undefined) continue;
    for (const judge of judges.filter((candidate) => judgesKind(ctx, candidate, quest))) {
      const key = keyOf(quest, checked, judge);
      const chars = kept.has(key)
        ? (kept.get(key) ?? null)
        : await measure(ctx, { quest, judge, checked }, lengthOf);
      sizes.set(key, chars);
      if (chars !== null) prompts.push({ quest: quest.id, character: judge.id, chars });
    }
  }
  return prompts;
}
