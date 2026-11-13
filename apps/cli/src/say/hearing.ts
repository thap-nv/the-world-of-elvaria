// What the Chancellor hears (implementation-plan §3.11, §10 question 3): the kingdom's territories, registry, characters
// and mana, and who speaks as the Chancellor (selectChancellor, §10 question 6). The owner's words (`elvaria say`) and
// the triage of memos (PS-03b: `elvaria triage`, `kingdom.schedule.triage`) share it, and an amendment's author (PS-22b).
import { CHANCELLOR_CLASS, poolsOf, selectChancellor, tribeLimitsOf } from '@elvaria/domain';
import type {
  ChancellorChoice,
  Character,
  CharacterClass,
  Registry,
  Territory,
  TribeId,
} from '@elvaria/domain';
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

/** Who speaks as the Chancellor, and what every session of it reads beside its own matter. */
export interface Speaker {
  readonly session: ChancellorSession;
  readonly registry: Registry;
  readonly territories: readonly Territory[];
  readonly characters: readonly Character[];
  readonly decree: string | null;
  readonly class_prompt: string | null;
}

/** Who may speak: the limits of each tribe with a runner, then the multi-tribe rule of the domain. */
export function chancellorOf(
  runners: Runners,
  characters: Parameters<typeof selectChancellor>[0],
): ChancellorChoice | undefined {
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

/** A session of the Chancellor's office for `speaking`; (PS-22b) a mage deciding an amendment speaks there too. */
export async function sessionOf(
  ctx: KingdomContext,
  speaking: {
    readonly choice: ChancellorChoice;
    readonly runner: AgentRunner;
    readonly class: CharacterClass;
  },
  folder: string,
): Promise<ChancellorSession> {
  return {
    runner: speaking.runner,
    choice: speaking.choice,
    characterClass: speaking.class,
    templates: await loadPromptTemplates(),
    // One folder per session, beside the quests' runs (§2.2): the prompt and the CLI's output stay readable.
    run_dir: inKingdom(ctx.store.root, `.runs/${folder}-${ctx.ids.ulid()}`),
    env: envOf(ctx, speaking.choice),
  };
}

/**
 * The Chancellor and what it reads, or undefined once the reason is printed: a registry that loads, and an idle
 * Chancellor whose tribe runs. `folder` names its run folder: `chancellor` for the owner's words, `triage`.
 */
export async function speakerOf(
  ctx: KingdomContext,
  runners: Runners,
  folder: string,
): Promise<Speaker | undefined> {
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
  return {
    session: await sessionOf(ctx, { choice, runner, class: characterClass }, folder),
    registry: registry.value,
    territories: territories.items,
    characters: characters.items,
    decree: await readDecree(ctx.store.root),
    class_prompt: await readClassPrompt(ctx.store.root, characterClass),
  };
}

/** Everything one utterance needs, or undefined once the reason is printed. */
export async function hearingOf(
  ctx: KingdomContext,
  utterance: string,
  runners: Runners,
): Promise<Hearing | undefined> {
  const speaker = await speakerOf(ctx, runners, 'chancellor');
  if (speaker === undefined) return undefined;
  const context: ChancellorContext = {
    utterance,
    locale: ctx.kingdom.owner.locale,
    decree: speaker.decree,
    class_prompt: speaker.class_prompt,
    territories: speaker.territories,
    registry: speaker.registry,
    roster: speaker.characters,
    // Readings come with P1-05; until then every enabled pool is awake (worldStateOf does the same).
    mana: poolsOf(ctx.kingdom.tribes),
    context_budget_tokens: ctx.kingdom.breakers.context_budget_tokens,
    // How large work goes through the council (PS-06).
    council: ctx.kingdom.dispatch.council,
  };
  return { context, session: speaker.session };
}
