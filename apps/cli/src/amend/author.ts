// The author of an amendment, as `elvaria run` asks it (PS-22b, implementation-plan §3.16.2; ADR 0024): the memo
// names the mage of the quest's plan, or no one, and then the Chancellor speaks. Either speaks in the Chancellor's
// office: a session with no tool (the Chancellor's class gives the tools), its reply the amendment-decision output.
// The mage reads its own class prompt and the plan quest its quest came from; both read the quest, the memo and the
// doer's letter. Nothing here decides: decideAmendment asks, amendmentCommand holds the reply against the delegation.
import { readFile } from 'node:fs/promises';

import { CHANCELLOR_CLASS, tribeLimitsOf } from '@elvaria/domain';
import type { Character, Memo, Quest, QuestId, Registry, Territory, TribeId } from '@elvaria/domain';
import type { ChancellorSession } from '@elvaria/chancellor';
import type { AmendmentContext } from '@elvaria/runner-core';
import { inKingdom, kingdomLayout, readClassPrompt, readDecree } from '@elvaria/store';

import { chancellorOf, sessionOf, speakerOf } from '../say/hearing.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners } from '../say/hearing.ts';

/** One quest that waits on its author: the quest, its amendment, the kingdom's quests (for the plan). */
export interface Waiting {
  readonly quest: Quest;
  readonly memo: Memo;
  readonly quests: readonly Quest[];
}

/** The author's session and what it reads; `none` when no author may speak now, so the owner decides. */
export type Authorship =
  | { readonly status: 'ready'; readonly session: ChancellorSession; readonly context: AmendmentContext }
  | { readonly status: 'none' };

/** The mage the memo names, when it is a character of the kingdom whose tribe runs. */
async function mageOf(ctx: KingdomContext, runners: Runners, memo: Memo): Promise<Character | undefined> {
  if (memo.to.author === undefined) return undefined;
  const read = await ctx.store.characters.read(memo.to.author);
  if (!read.ok || read.value.status === 'suspended') return undefined;
  return runners[read.value.tribe] === undefined ? undefined : read.value;
}

/**
 * The tribe the author speaks on, for a job that waits until that tribe runs no session; undefined when no author
 * may speak (no Chancellor, the mage gone), which needs no tribe.
 */
export async function authorTribeOf(
  ctx: KingdomContext,
  runners: Runners,
  memo: Memo,
): Promise<TribeId | undefined> {
  if (memo.to.author !== undefined) return (await mageOf(ctx, runners, memo))?.tribe;
  const characters = await ctx.store.characters.list();
  return chancellorOf(runners, characters.items)?.character.tribe;
}

/** The doer's letter as its run left it; null when it cannot be read. */
async function letterOf(ctx: KingdomContext, quest: QuestId): Promise<string | null> {
  try {
    return await readFile(inKingdom(ctx.store.root, kingdomLayout.handover(quest)), 'utf8');
  } catch {
    return null;
  }
}

/** The quest the council made `quest` from: up its parents, the first the council did not make. */
function planOf(quest: Quest, quests: readonly Quest[]): Quest | undefined {
  let at: Quest | undefined = quest;
  const seen = new Set<QuestId>();
  while (at?.created_by === 'council' && typeof at.parent_id === 'string' && !seen.has(at.parent_id)) {
    seen.add(at.parent_id);
    const parent: QuestId = at.parent_id;
    at = quests.find(({ id }) => id === parent);
  }
  return at === quest ? undefined : at;
}

interface Speaking {
  readonly session: ChancellorSession;
  readonly registry: Registry;
  readonly decree: string | null;
  readonly class_prompt: string | null;
  readonly role: AmendmentContext['role'];
}

/** The mage in the Chancellor's office: the Chancellor's class gives no tool, the mage's own tools are left out. */
async function mageSpeaking(
  ctx: KingdomContext,
  runners: Runners,
  memo: Memo,
): Promise<Speaking | undefined> {
  const mage = await mageOf(ctx, runners, memo);
  const registry = await ctx.store.loadRegistry();
  const runner = mage === undefined ? undefined : runners[mage.tribe];
  if (mage === undefined || runner === undefined || !registry.ok) return undefined;
  const office = registry.value.classes.find(({ id }) => id === CHANCELLOR_CLASS);
  const own = registry.value.classes.find(({ id }) => id === mage.class);
  if (office === undefined) return undefined;
  const { tools: _own, ...bare } = mage;
  const choice = { character: bare, structured_output: tribeLimitsOf(runner.capabilities).structured_output };
  return {
    session: await sessionOf(ctx, { choice, runner, class: office }, 'amendment'),
    registry: registry.value,
    decree: await readDecree(ctx.store.root),
    class_prompt: own === undefined ? null : await readClassPrompt(ctx.store.root, own),
    role: 'mage',
  };
}

async function speakingOf(ctx: KingdomContext, runners: Runners, memo: Memo): Promise<Speaking | undefined> {
  if (memo.to.author !== undefined) return mageSpeaking(ctx, runners, memo);
  const speaker = await speakerOf(ctx, runners, 'amendment');
  if (speaker === undefined) return undefined;
  const { session, registry, decree, class_prompt: classPrompt } = speaker;
  return { session, registry, decree, class_prompt: classPrompt, role: 'chancellor' };
}

/** Who decides `waiting`, and what it reads; `none` when nobody may. */
export async function authorshipOf(
  ctx: KingdomContext,
  runners: Runners,
  { quest, memo, quests }: Waiting,
): Promise<Authorship> {
  const speaking = await speakingOf(ctx, runners, memo);
  if (speaking === undefined) return { status: 'none' };
  const { session, decree, class_prompt: classPrompt, role } = speaking;
  const plan = role === 'mage' ? planOf(quest, quests) : undefined;
  const context: AmendmentContext = {
    locale: ctx.kingdom.owner.locale,
    decree,
    role,
    class_prompt: classPrompt,
    context_budget_tokens: ctx.kingdom.breakers.context_budget_tokens,
    quest,
    memo,
    ...(plan === undefined ? {} : { plan }),
    letter: await letterOf(ctx, quest.id),
  };
  return { status: 'ready', session, context };
}

/** The territory of the quest, for the protected paths the memo's files may name. */
export async function territoryOf(ctx: KingdomContext, quest: Quest): Promise<Territory | undefined> {
  const read = await ctx.store.territories.read(quest.territory);
  return read.ok ? read.value : undefined;
}
