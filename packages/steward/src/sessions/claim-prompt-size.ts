// The assignees' prompts for the open quests about to be claimed, measured before the tick (fix/claim-step, as
// review/prompt-size.ts measures the judges'): planTick passes over a character whose tribe takes a shorter prompt
// on this OS (selectAssignee), where in the PS-07 run an agy knight given a long quest could not open its session and
// the quest went to the infirmary at its start (`breaker:no_session`). Only a character of a tribe with such a limit
// is measured (agy on Windows: `capabilities.prompt_max_chars`, in ctx.limits), of the quest's class, only for an open
// session-tier quest a character takes whose dependencies are done, and once per quest and character: the length is
// kept until the quest or its log change. A kingdom without such a tribe measures nothing. The prompt is the one the
// session would get: a letter too long to copy goes by its path (letter-fit.ts). A quest its assignee goes on with
// has nobody to choose, so it is not measured here: its session names the letter's path as it opens, when it must.
import { currentRun, machineMergeDue, questFinished } from '@elvaria/domain';
import type { Character, ClaimPrompt, Quest } from '@elvaria/domain';

import { fittedInput } from './letter-fit.ts';
import { startContinuationOf } from './open.ts';
import { userPromptLengthOf } from './request.ts';
import type { Context } from '../context.ts';
import type { PromptSizes } from '../review/prompt-size.ts';
import type { LengthOf } from './letter-fit.ts';

/** The characters that may be measured: not in the Temple, of a tribe with a prompt limit here. */
const limitedCharacters = (ctx: Context): Character[] =>
  [...ctx.world.characters.values()].filter(
    (character) =>
      character.status !== 'suspended' && ctx.limits[character.tribe]?.prompt_max_chars !== undefined,
  );

/** An open quest a character may claim in this tick: of the session tier, not the machine's merge, its needs done. */
function dueClaim(ctx: Context, quest: Quest): boolean {
  if (quest.status !== 'open' || quest.tier !== 'session' || machineMergeDue(quest)) return false;
  return quest.depends_on.every((id) => {
    const need = ctx.world.quests.get(id);
    return need !== undefined && questFinished(need);
  });
}

/** What the assignee's prompt is made of: the quest as the owner last left it, its runs so far, the character. */
const keyOf = (quest: Quest, character: Character): string =>
  [quest.id, quest.updated_at, quest.attempt_log.length, character.id].join('|');

async function measure(
  ctx: Context,
  { quest, character }: { quest: Quest; character: Character },
  lengthOf: LengthOf,
): Promise<number | null> {
  const territory = ctx.world.territories.get(quest.territory);
  if (territory === undefined) return null;
  try {
    const input = {
      role: 'assignee',
      // The quest as its start sees it: claimed by this character.
      quest: { ...quest, status: 'claimed', assignee: character.id },
      character,
      territory,
      n: currentRun(quest) + 1,
      // No plot before the claim: a tribe without a context file reads the territory's own (§3.14 `context: prompt`).
      cwd: territory.path,
      continuation: await startContinuationOf(ctx, quest),
    } as const;
    // As the session would open: a letter too long to copy goes by its path (letter-fit.ts).
    return (await fittedInput(ctx, input, lengthOf)).chars ?? (await lengthOf(ctx, input));
  } catch (error) {
    // The session would fail the same way when it opens: the log says why there, and nobody is passed over.
    const message = error instanceof Error ? error.message : String(error);
    ctx.deps.log.warn(`steward: ${quest.id}: cannot measure ${character.id}'s prompt: ${message}`);
    return null;
  }
}

/** The prompt of each measured character for each quest about to be claimed; `sizes` keeps them for the next tick. */
export async function claimPromptsOf(
  ctx: Context,
  sizes: PromptSizes,
  lengthOf: LengthOf = userPromptLengthOf,
): Promise<ClaimPrompt[]> {
  const kept = new Map(sizes);
  sizes.clear();
  const characters = limitedCharacters(ctx);
  const prompts: ClaimPrompt[] = [];
  if (characters.length === 0) return prompts;
  for (const quest of ctx.world.quests.values()) {
    if (!dueClaim(ctx, quest)) continue;
    for (const character of characters.filter((c) => c.class === quest.class_required)) {
      const key = keyOf(quest, character);
      const chars = kept.has(key)
        ? (kept.get(key) ?? null)
        : await measure(ctx, { quest, character }, lengthOf);
      sizes.set(key, chars);
      if (chars !== null) prompts.push({ quest: quest.id, character: character.id, chars });
    }
  }
  return prompts;
}
