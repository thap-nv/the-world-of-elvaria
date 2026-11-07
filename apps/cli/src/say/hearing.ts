// What the Chancellor hears with the owner's words (implementation-plan §3.11, §10 question 3): the kingdom's
// territories, registry, characters and mana, and who speaks as the Chancellor (selectChancellor, §10 question 6).
import { CHANCELLOR_CLASS, poolsOf, selectChancellor, tribeLimitsOf } from '@elvaria/domain';
import type { ChancellorChoice, CharacterClass, TribeId } from '@elvaria/domain';
import { loadPromptTemplates } from '@elvaria/runner-core';
import type { AgentRunner, ChancellorContext } from '@elvaria/runner-core';
import { inKingdom, readClassPrompt, readDecree } from '@elvaria/store';

import { registryIssueLines } from '../issues.ts';
import type { ChancellorSession } from '@elvaria/chancellor';
import type { KingdomContext } from '../kingdom-context.ts';

/** The runners of the tribes that work now: what `elvaria run` builds (crewOf). */
export type Runners = Partial<Record<TribeId, AgentRunner>>;

export interface Hearing {
  readonly context: ChancellorContext;
  readonly session: ChancellorSession;
}

/** Who may speak: the limits of each tribe with a runner, then the multi-tribe rule of the domain. */
function chancellorOf(runners: Runners, characters: Parameters<typeof selectChancellor>[0]) {
  const limits = Object.fromEntries(
    Object.entries(runners).flatMap(([tribe, runner]) =>
      runner === undefined ? [] : [[tribe, tribeLimitsOf(runner.capabilities)]],
    ),
  );
  return selectChancellor(characters, limits);
}

/** The session's context for the hook (§3.6): no quest, the Chancellor's character and role. */
const envOf = (ctx: KingdomContext, choice: ChancellorChoice): Record<string, string> => ({
  ELVARIA_KINGDOM: ctx.store.root,
  ELVARIA_CHARACTER: choice.character.id,
  ELVARIA_ROLE: 'chancellor',
  ELVARIA_TRIBE: choice.character.tribe,
  ELVARIA_MODEL: choice.character.model,
  ELVARIA_TZ: ctx.kingdom.tz,
});

async function sessionOf(
  ctx: KingdomContext,
  choice: ChancellorChoice,
  runner: AgentRunner,
  characterClass: CharacterClass,
): Promise<ChancellorSession> {
  return {
    runner,
    choice,
    characterClass,
    templates: await loadPromptTemplates(),
    // One folder per utterance, beside the quests' runs (§2.2): the prompt and the CLI's output stay readable.
    run_dir: inKingdom(ctx.store.root, `.runs/chancellor-${ctx.ids.ulid()}`),
    env: envOf(ctx, choice),
  };
}

/**
 * Everything one utterance needs, or undefined once the reason is printed: a registry that loads, and an idle
 * Chancellor whose tribe runs.
 */
export async function hearingOf(
  ctx: KingdomContext,
  utterance: string,
  runners: Runners,
): Promise<Hearing | undefined> {
  const registry = await ctx.store.loadRegistry();
  if (!registry.ok) {
    registry.error.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return undefined;
  }
  const [territories, characters] = await Promise.all([
    ctx.store.territories.list(),
    ctx.store.characters.list(),
  ]);
  const choice = chancellorOf(runners, characters.items);
  const runner = choice === undefined ? undefined : runners[choice.character.tribe];
  const characterClass = registry.value.classes.find(({ id }) => id === CHANCELLOR_CLASS);
  if (choice === undefined || runner === undefined || characterClass === undefined) {
    ctx.io.err(ctx.t('cli.say.no_chancellor', { class: CHANCELLOR_CLASS }));
    return undefined;
  }
  const context: ChancellorContext = {
    utterance,
    locale: ctx.kingdom.owner.locale,
    decree: await readDecree(ctx.store.root),
    class_prompt: await readClassPrompt(ctx.store.root, characterClass),
    territories: territories.items,
    registry: registry.value,
    roster: characters.items,
    // Readings come with P1-05; until then every enabled pool is awake (worldStateOf does the same).
    mana: poolsOf(ctx.kingdom.tribes),
    context_budget_tokens: ctx.kingdom.breakers.context_budget_tokens,
  };
  return { context, session: await sessionOf(ctx, choice, runner, characterClass) };
}
