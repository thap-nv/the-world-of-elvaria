// The author of an amendment, as `elvaria run` asks it (PS-22b, implementation-plan §3.16.2; ADR 0024): the memo
// names the mage of the quest's plan, or no one, and then the Chancellor speaks. Either speaks in the Chancellor's
// office: a session with no tool (the Chancellor's class gives the tools), its reply the amendment-decision output.
// The mage reads its own class prompt, the plan quest its quest came from and the summary of that plan's file while
// the plan's plot holds it (fix/mage-plan-file, PS-22b (C)); both read the quest, the memo and the doer's letter.
// Nothing here decides: decideAmendment asks, amendmentCommand holds the reply against the delegation.
import { readFile } from 'node:fs/promises';

import { CHANCELLOR_CLASS, holdOf, tribeLimitsOf } from '@elvaria/domain';
import type {
  Character,
  Memo,
  Quest,
  QuestId,
  Registry,
  Territory,
  TribeHold,
  TribeId,
} from '@elvaria/domain';
import type { ChancellorSession } from '@elvaria/chancellor';
import type { AmendmentContext } from '@elvaria/runner-core';
import { inKingdom, kingdomLayout, readClassPrompt, readDecree } from '@elvaria/store';

import { planSummariesOf } from '../quest/plan-view.ts';
import { chancellorOf, sessionOf, speakerOf } from '../say/hearing.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners } from '../say/hearing.ts';

/** One quest that waits on its author: the quest, its amendment, the kingdom's quests (for the plan). */
export interface Waiting {
  readonly quest: Quest;
  readonly memo: Memo;
  readonly quests: readonly Quest[];
}

/**
 * The author's session and what it reads; `none` when no author may speak, so the owner decides; `held` when the author
 * is of a tribe held by its CLI's version (fix/held-tribe-sessions): it speaks once a check passes, nobody else does.
 */
export type Authorship =
  | { readonly status: 'ready'; readonly session: ChancellorSession; readonly context: AmendmentContext }
  | { readonly status: 'none' }
  | { readonly status: 'held' };

/** Who would author the memo now: a character of a tribe that runs, or why none does. */
type Author =
  | { readonly status: 'ready'; readonly character: Character }
  | { readonly status: 'none' }
  | { readonly status: 'held' };

/**
 * The mage the memo names, when it is a character of the kingdom whose tribe runs; one of a held tribe waits for its
 * check (holdOf), as planTick holds a quest's doer, instead of handing its amendment to the owner.
 */
async function mageOf(
  ctx: KingdomContext,
  runners: Runners,
  memo: Memo,
  holds: readonly TribeHold[],
): Promise<Author> {
  if (memo.to.author === undefined) return { status: 'none' };
  const read = await ctx.store.characters.read(memo.to.author);
  if (!read.ok || read.value.status === 'suspended' || runners[read.value.tribe] === undefined)
    return { status: 'none' };
  return holdOf(holds, read.value.tribe) === undefined
    ? { status: 'ready', character: read.value }
    : { status: 'held' };
}

/**
 * The tribe the author speaks on, for a job that waits until that tribe runs no session: `none` when no author may
 * speak (no Chancellor, the mage gone), which needs no tribe; `held` while every author is of a held tribe.
 */
export async function authorTribeOf(
  ctx: KingdomContext,
  runners: Runners,
  memo: Memo,
  holds: readonly TribeHold[] = [],
): Promise<{ readonly status: 'ready'; readonly tribe: TribeId } | Exclude<Author, { status: 'ready' }>> {
  const author =
    memo.to.author === undefined
      ? await chancellorAuthor(ctx, runners, holds)
      : await mageOf(ctx, runners, memo, holds);
  return author.status === 'ready' ? { status: 'ready', tribe: author.character.tribe } : author;
}

async function chancellorAuthor(
  ctx: KingdomContext,
  runners: Runners,
  holds: readonly TribeHold[],
): Promise<Author> {
  const pick = chancellorOf(runners, (await ctx.store.characters.list()).items, holds);
  return pick.status === 'chosen' ? { status: 'ready', character: pick.choice.character } : pick;
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
  holds: readonly TribeHold[],
): Promise<Speaking | 'held' | undefined> {
  const author = await mageOf(ctx, runners, memo, holds);
  if (author.status === 'held') return 'held';
  const mage = author.status === 'ready' ? author.character : undefined;
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

async function speakingOf(
  ctx: KingdomContext,
  runners: Runners,
  memo: Memo,
  holds: readonly TribeHold[],
): Promise<Speaking | 'held' | undefined> {
  if (memo.to.author !== undefined) return mageSpeaking(ctx, runners, memo, holds);
  const found = await speakerOf(ctx, runners, 'amendment', holds);
  if (found.status !== 'ready') return found.status === 'held' ? 'held' : undefined;
  const { session, registry, decree, class_prompt: classPrompt } = found.speaker;
  return { session, registry, decree, class_prompt: classPrompt, role: 'chancellor' };
}

/** Who decides `waiting`, and what it reads; `none` when nobody may, `held` while its author's tribe is held. */
export async function authorshipOf(
  ctx: KingdomContext,
  runners: Runners,
  { quest, memo, quests }: Waiting,
  holds: readonly TribeHold[] = [],
): Promise<Authorship> {
  const speaking = await speakingOf(ctx, runners, memo, holds);
  if (speaking === 'held') return { status: 'held' };
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
    ...(plan === undefined ? {} : { plan, plan_summaries: await planSummariesOf(ctx, plan) }),
    letter: await letterOf(ctx, quest.id),
  };
  return { status: 'ready', session, context };
}

/** The territory of the quest, for the protected paths the memo's files may name. */
export async function territoryOf(ctx: KingdomContext, quest: Quest): Promise<Territory | undefined> {
  const read = await ctx.store.territories.read(quest.territory);
  return read.ok ? read.value : undefined;
}
