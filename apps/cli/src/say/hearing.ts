// What the Chancellor hears (implementation-plan §3.11, §10 question 3): the kingdom's territories, registry, characters
// and mana, and who speaks as the Chancellor (selectChancellor, §10 question 6). The owner's words (`elvaria say`) and
// the triage of memos (PS-03b: `elvaria triage`, `kingdom.schedule.triage`) share it, and an amendment's author (PS-22b).
// A Chancellor of a tribe held by its CLI's version opens no session (fix/held-tribe-sessions), as in planTick.
import { CHANCELLOR_CLASS, pickChancellor, poolsOf, tribeLimitsOf } from '@elvaria/domain';
import type {
  ChancellorChoice,
  ChancellorPick,
  Character,
  CharacterClass,
  Registry,
  Territory,
  TribeHold,
  TribeId,
} from '@elvaria/domain';
import { loadPromptTemplates } from '@elvaria/runner-core';
import type { AgentRunner, ChancellorContext } from '@elvaria/runner-core';
import { inKingdom, readClassPrompt, readDecree } from '@elvaria/store';

import { registryIssueLines } from '../issues.ts';
import { lineOf } from '../run/bell.ts';
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

/**
 * Who may speak: the limits of each tribe with a runner, then the multi-tribe rule of the domain, a tribe held by its
 * CLI's version giving way as in planTick (pickChancellor, fix/held-tribe-sessions).
 */
export function chancellorOf(
  runners: Runners,
  characters: Parameters<typeof pickChancellor>[0],
  holds: readonly TribeHold[] = [],
): ChancellorPick {
  const limits = Object.fromEntries(
    Object.entries(runners).flatMap(([tribe, runner]) =>
      runner === undefined ? [] : [[tribe, tribeLimitsOf(runner.capabilities)]],
    ),
  );
  return pickChancellor(characters, limits, holds);
}

/** Why no session opens: the holds of the tribes that could speak, as the Steward's bell says them, and what to run. */
export function heldLines(ctx: KingdomContext, holds: readonly TribeHold[]): string[] {
  return [
    ctx.t('cli.say.chancellor_held'),
    ...holds.map((hold) => lineOf(ctx.t, { kind: 'tribe_held', ...hold })),
  ];
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

/** The Chancellor and what it reads; `held` or `none` once the reason is printed. */
export type SpeakerFound =
  | { readonly status: 'ready'; readonly speaker: Speaker }
  /** Every Chancellor who could speak is of a tribe held by its CLI's version: the session waits on a check. */
  | { readonly status: 'held' }
  | { readonly status: 'none' };

/**
 * The Chancellor and what it reads: a registry that loads, and an idle Chancellor whose tribe runs and is not held
 * (`holds`, fix/held-tribe-sessions). `folder` names its run folder: `chancellor` for the owner's words, `triage`.
 */
export async function speakerOf(
  ctx: KingdomContext,
  runners: Runners,
  folder: string,
  holds: readonly TribeHold[] = [],
): Promise<SpeakerFound> {
  const registry = await ctx.store.loadRegistry();
  if (!registry.ok) {
    registry.error.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return { status: 'none' };
  }
  const [territories, characters] = await Promise.all([
    ctx.store.territories.list(),
    ctx.store.characters.list(),
  ]);
  const pick = chancellorOf(runners, characters.items, holds);
  if (pick.status === 'held') {
    heldLines(ctx, pick.holds).forEach(ctx.io.err);
    return { status: 'held' };
  }
  const choice = pick.status === 'chosen' ? pick.choice : undefined;
  const runner = choice === undefined ? undefined : runners[choice.character.tribe];
  const characterClass = registry.value.classes.find(({ id }) => id === CHANCELLOR_CLASS);
  if (choice === undefined || runner === undefined || characterClass === undefined) {
    ctx.io.err(ctx.t('cli.say.no_chancellor', { class: CHANCELLOR_CLASS }));
    return { status: 'none' };
  }
  const speaker: Speaker = {
    session: await sessionOf(ctx, { choice, runner, class: characterClass }, folder),
    registry: registry.value,
    territories: territories.items,
    characters: characters.items,
    decree: await readDecree(ctx.store.root),
    class_prompt: await readClassPrompt(ctx.store.root, characterClass),
  };
  return { status: 'ready', speaker };
}

/** Everything one utterance needs, or undefined once the reason is printed (a held tribe's among them). */
export async function hearingOf(
  ctx: KingdomContext,
  utterance: string,
  runners: Runners,
  holds: readonly TribeHold[] = [],
): Promise<Hearing | undefined> {
  const found = await speakerOf(ctx, runners, 'chancellor', holds);
  if (found.status !== 'ready') return undefined;
  const { speaker } = found;
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
