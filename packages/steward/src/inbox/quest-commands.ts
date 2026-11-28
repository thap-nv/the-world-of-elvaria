// The owner's commands on quests (implementation-plan §2.3 inbox-command, §2.5): each is one move of the table
// by the owner (U), or a field change through the domain's quest functions. The Steward decides nothing here
// beyond what the command names; the table and the schemas refuse what does not fit.
import { createHash } from 'node:crypto';

import {
  editQuest,
  err,
  formatDatedId,
  healerOf,
  namedAssignee,
  parseInstant,
  partyOf,
  poolOpenOf,
  ok,
  questFromCommand,
  sealPolicyOf,
  selectAssignee,
  setRank,
  zonedTime,
} from '@elvaria/domain';
import type {
  Character,
  InboxCommandOf,
  Quest,
  QuestEventType,
  QuestId,
  Result,
  TerritoryId,
} from '@elvaria/domain';

import { closeTaken } from '../memos/close.ts';
import { moveAndRing } from '../bell/move-and-ring.ts';
import { OWNER, actorOfCommand, step } from '../quest/record.ts';
import { releasePlot } from '../plot/release.ts';
import { openAssignee } from '../sessions/open.ts';
import { modelsOf } from '../tick/world.ts';
import type { Context } from '../context.ts';
import type { Edits } from '../quest/record.ts';

export type Outcome =
  /**
   * `quest`: the quest the command.applied line names (`deliver`, PS-08c: forgeOutcomesOf reads it); `territory`, the
   * territory it names (CM-08, a `deliver` naming one: trainOrdersOf reads it).
   */
  | { readonly status: 'applied'; readonly quest?: Quest; readonly territory?: TerritoryId }
  | { readonly status: 'rejected'; readonly reason: string }
  /** Not now, not refused: the command stays in the inbox for a later tick. */
  | { readonly status: 'waiting' };

export const APPLIED = { status: 'applied' } as const satisfies Outcome;
export const rejected = (reason: string): Extract<Outcome, { status: 'rejected' }> => ({
  status: 'rejected',
  reason,
});
const outcomeOf = (result: Result<unknown, string>): Outcome =>
  result.ok ? APPLIED : rejected(result.error);

/**
 * The quest id of a create_quest, derived from the command id: a command applied again after a crash between its
 * file and its ack finds its quest already there instead of making a second one. The CLI derives the same ids to
 * write the Chancellor's drafts that depend on each other (P1-13). Undefined only for a zone or a time their schemas
 * would have refused.
 */
export function questIdOfCommand(
  command: { readonly id: string; readonly ts: string },
  tz: string,
): QuestId | undefined {
  const zone = zonedTime(tz);
  const when = parseInstant(command.ts);
  if (!zone.ok || !when.ok) return undefined;
  const day = zone.value.localDate(when.value);
  // formatDatedId with the `q` prefix produces exactly the quest id pattern.
  return formatDatedId('q', day, createHash('sha256').update(command.id).digest()) as QuestId;
}

/**
 * `create_quest`. With an assignee (P1-29), the domain has checked it before the quest exists, and the new quest
 * goes to it by the owner's reassign (§2.5 `open.reassign`), so only it takes the quest, its level aside. The memos
 * it is made from (PS-03b) close as handled by it once it is open; those of a draft wait for the owner's confirm.
 * `readOnly`: an inquiry device sent it (P2-01d, deviceCheck), so the quest only asks a question.
 */
export async function createQuest(
  ctx: Context,
  command: InboxCommandOf<'create_quest'>,
  readOnly = false,
): Promise<Outcome> {
  const id = questIdOfCommand(command, ctx.world.kingdom.tz) ?? ctx.deps.ids.quest();
  const known = ctx.world.quests.get(id);
  const made = known === undefined ? await newQuest(ctx, command, id, readOnly) : ok(known);
  if (!made.ok) return made.error;
  if (made.value.status !== 'draft')
    await closeTaken(ctx, command.payload.memos, made.value.id, actorOfCommand(command));
  return givenTo(ctx, made.value, command.payload.assignee);
}

/** The quest file of a create_quest seen for the first time, and its line. */
async function newQuest(
  ctx: Context,
  command: InboxCommandOf<'create_quest'>,
  id: QuestId,
  readOnly: boolean,
): Promise<Result<Quest, Extract<Outcome, { status: 'rejected' }>>> {
  const made = questFromCommand(command.payload, {
    id,
    at: ctx.record.stamp(),
    breakers: ctx.world.kingdom.breakers,
    registry: ctx.world.registry,
    // With the secrets each allows: a quest asking for more is refused here (ADR 0013).
    territories: [...ctx.world.territories.values()],
    quests: [...ctx.world.quests.keys()],
    characters: [...ctx.world.characters.values()],
    tribes: ctx.world.kingdom.tribes,
    // PS-08b: the owner's and the Chancellor's quests may be spared the seal by the kingdom's delegation, unless the
    // breaker suspended it on their territory (PS-08g).
    seal: sealPolicyOf(ctx.world.kingdom, ctx.delegation.suspensions),
    // P2-01d: from the device file the command names, never from its payload.
    ...(readOnly ? { read_only: true } : {}),
  });
  if (!made.ok) return err(rejected(made.error.code));
  const type = made.value.status === 'draft' ? 'quest.drafted' : 'quest.created';
  const put = await ctx.record.put(made.value, type, actorOfCommand(command));
  return put.ok ? put : err(rejected(put.error));
}

/**
 * The new quest's named assignee takes it. Once: a command applied again after a crash finds its quest open and
 * still unclaimed only when the crash came between the file and the reassign.
 */
async function givenTo(ctx: Context, quest: Quest, assignee: string | undefined): Promise<Outcome> {
  if (assignee === undefined || quest.status !== 'open' || quest.assignee !== null) return APPLIED;
  return reassign(ctx, quest, assignee);
}

/** The quest's holders let go of it: the assignee, a healer (ADR 0034) and the verifier whose `current` is it. */
function letGo(ctx: Context, quest: Quest): Edits {
  const edits: Record<string, ReturnType<typeof step>> = {};
  for (const id of [quest.assignee, healerOf(quest), quest.verifier]) {
    const holder = typeof id === 'string' ? ctx.world.characters.get(id) : undefined;
    if (holder?.current?.quest !== quest.id) continue;
    edits[holder.id] = step(holder.status === 'sleeping_mana' ? 'unassign' : 'cancel');
  }
  return edits;
}

export async function cancel(ctx: Context, quest: Quest): Promise<Outcome> {
  const moved = await moveAndRing(ctx, {
    quest: quest.id,
    event: { type: 'cancel' },
    actor: 'user',
    edits: letGo(ctx, quest),
  });
  if (moved.ok) await ctx.sessions.kill(quest.id, 'the owner cancelled the quest');
  return outcomeOf(moved);
}

/** `archive` covers three rows (§2.3): discard a draft, reject work waiting for the seal, archive the rest. */
const ARCHIVE_EVENT: Partial<Record<Quest['status'], 'discard' | 'reject'>> = {
  draft: 'discard',
  awaiting_seal: 'reject',
};

export async function archive(ctx: Context, quest: Quest): Promise<Outcome> {
  const type: Extract<QuestEventType, 'discard' | 'reject' | 'archive'> =
    ARCHIVE_EVENT[quest.status] ?? 'archive';
  const moved = await moveAndRing(ctx, { quest: quest.id, event: { type }, actor: 'user' });
  if (moved.ok) await releasePlot(ctx, moved.value);
  return outcomeOf(moved);
}

/**
 * The owner's answer. With an assignee the same attempt goes on (a fresh session, or the asking one resumed when
 * the answer comes in time, ADR 0017), so the answer waits in the inbox until that character is free, its tribe
 * can run it and its pool has mana (§2.5, §3.5); without one the quest opens again.
 */
export async function answer(ctx: Context, quest: Quest, text: string): Promise<Outcome> {
  if (quest.status !== 'blocked' || typeof quest.assignee !== 'string')
    return outcomeOf(
      await moveAndRing(ctx, { quest: quest.id, event: { type: 'answer', answer: text }, actor: 'user' }),
    );
  if (answerWaits(ctx, quest)) return { status: 'waiting' };
  return outcomeOf(await openAssignee(ctx, quest.id, { kind: 'answer', answer: text }));
}

/**
 * An answer to `quest` waits in the inbox: its asker is busy elsewhere, its tribe has no runner, or its pool no mana.
 * Also what an amendment's decision waits on, before it writes anything (PS-22b).
 */
export function answerWaits(ctx: Context, quest: Quest): boolean {
  if (quest.status !== 'blocked' || typeof quest.assignee !== 'string') return false;
  const asker = ctx.world.characters.get(quest.assignee);
  if (asker?.status !== 'idle' || ctx.deps.runners[asker.tribe] === undefined) return true;
  const { kingdom } = ctx.world;
  const mana = { readings: ctx.mana.readings, config: kingdom.mana };
  return !poolOpenOf({ kingdom, asleep: ctx.mana.asleep, mana }, ctx.deps.clock.now())(asker);
}

/** The character the owner named, or the Steward's own choice among the free ones (§2.3 reassign). */
function newAssignee(ctx: Context, quest: Quest, named: string | undefined): Result<Character, string> {
  if (named === undefined) {
    const free = [...ctx.world.characters.values()].filter(
      (c) => c.status === 'idle' && c.id !== quest.assignee && ctx.deps.runners[c.tribe] !== undefined,
    );
    // The Steward's own choice keeps the party's bars, as a claim does (P1-21 (b)); the owner's named one does not.
    const characters = [...ctx.world.characters.values()];
    const party = partyOf(quest, [...ctx.world.quests.values()]);
    const chosen = selectAssignee(quest, free, { party, characters, models: modelsOf(ctx.deps.runners) });
    return chosen === undefined ? { ok: false, error: 'no_candidate' } : { ok: true, value: chosen };
  }
  // The same check as a create_quest naming its assignee (P1-29), a disabled tribe included.
  const character = ctx.world.characters.get(named as Character['id']);
  const chosen = namedAssignee(quest.class_required, character, ctx.world.kingdom.tribes);
  return chosen.ok ? chosen : { ok: false, error: chosen.error.code };
}

/**
 * `reassign`: the owner gives the quest to a character, the level aside (canTake bounds only the Steward's own
 * choice); a stretch above the ceiling makes it wait for the seal. It starts once its dependencies are done and
 * the character is free (planTick `starts`).
 */
export async function reassign(ctx: Context, quest: Quest, named: string | undefined): Promise<Outcome> {
  const chosen = newAssignee(ctx, quest, named);
  if (!chosen.ok) return rejected(chosen.error);
  const before = typeof quest.assignee === 'string' ? ctx.world.characters.get(quest.assignee) : undefined;
  // A paused quest's old assignee sleeps on it; it lets go (§2.6 `sleeping_mana.unassign`).
  const edits: Edits =
    before?.current?.quest === quest.id && before.id !== chosen.value.id
      ? { [before.id]: step('unassign') }
      : {};
  const event = { type: 'reassign', assignee: chosen.value.id, level: chosen.value.level } as const;
  return outcomeOf(await moveAndRing(ctx, { quest: quest.id, event, actor: 'user', edits }));
}

export async function changeRank(ctx: Context, quest: Quest, rank: Quest['rank']): Promise<Outcome> {
  const changed = setRank(quest, rank, ctx.record.stamp());
  if (!changed.ok) return rejected(changed.error.code);
  return outcomeOf(await ctx.record.put(changed.value, 'quest.edited', OWNER));
}

export async function edit(
  ctx: Context,
  quest: Quest,
  command: InboxCommandOf<'edit_quest'>,
): Promise<Outcome> {
  const changed = editQuest(quest, command.payload, {
    at: ctx.record.stamp(),
    quests: [...ctx.world.quests.keys()],
  });
  if (!changed.ok) return rejected(changed.error.code);
  const actor = actorOfCommand(command);
  const put = await ctx.record.put(changed.value, 'quest.edited', actor);
  // The memos the edit takes in (PS-03b) close only once the quest holds their work.
  if (put.ok) await closeTaken(ctx, command.payload.memos, quest.id, actor);
  return outcomeOf(put);
}

/**
 * The owner confirms a draft; the memos it was made from close as handled by it (PS-03b). With an assignee
 * (`quest confirm --to`), the character is checked before anything is written, as a reassign naming it, so a wrong
 * name leaves the draft untouched; then the open quest goes to it by the owner's reassign (§2.5 `open.reassign`) in
 * this same apply. Inbox commands are applied before the tick plans, so no claim can take the quest in between,
 * which a later `quest reassign --to` could not undo once the quest was working (q_20261120_tpzvk5).
 * A stopped Steward may leave the quest open between the two moves; the command applied again finds it open and
 * unclaimed, skips the confirm (the table would refuse it, `no_transition`) and only gives it, as `givenTo` does.
 */
export async function confirm(ctx: Context, quest: Quest, named?: string): Promise<Outcome> {
  const chosen = named === undefined ? undefined : newAssignee(ctx, quest, named);
  if (chosen?.ok === false) return rejected(chosen.error);
  // Only an open, unclaimed quest: one held by anyone is not given again, and a plain confirm stays refused.
  const resumed = chosen !== undefined && quest.status === 'open' && quest.assignee === null;
  const confirmed = resumed ? APPLIED : await ownerMove(ctx, quest, 'confirm');
  if (confirmed.status !== 'applied') return confirmed;
  await closeTaken(ctx, quest.memos, quest.id, OWNER);
  if (chosen === undefined) return confirmed;
  const event = { type: 'reassign', assignee: chosen.value.id, level: chosen.value.level } as const;
  return outcomeOf(await moveAndRing(ctx, { quest: quest.id, event, actor: 'user' }));
}

/** A plain move of the owner: confirm, retry. */
export const ownerMove = async (ctx: Context, quest: Quest, type: 'confirm' | 'retry'): Promise<Outcome> =>
  outcomeOf(await moveAndRing(ctx, { quest: quest.id, event: { type }, actor: 'user' }));
