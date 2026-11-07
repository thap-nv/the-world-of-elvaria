// The owner's commands on quests (implementation-plan §2.3 inbox-command, §2.5): each is one move of the table
// by the owner (U), or a field change through the domain's quest functions. The Steward decides nothing here
// beyond what the command names; the table and the schemas refuse what does not fit.
import { createHash } from 'node:crypto';

import {
  editQuest,
  formatDatedId,
  parseInstant,
  poolOpenOf,
  questFromCommand,
  selectAssignee,
  setRank,
  zonedTime,
} from '@elvaria/domain';
import type { Character, InboxCommandOf, Quest, QuestEventType, QuestId, Result } from '@elvaria/domain';

import { moveAndRing } from '../notices.ts';
import { OWNER, step } from '../record.ts';
import { openAssignee } from '../sessions/open.ts';
import type { Context } from '../context.ts';
import type { Edits } from '../record.ts';

export type Outcome =
  | { readonly status: 'applied' }
  | { readonly status: 'rejected'; readonly reason: string }
  /** Not now, not refused: the command stays in the inbox for a later tick. */
  | { readonly status: 'waiting' };

export const APPLIED: Outcome = { status: 'applied' };
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

export async function createQuest(ctx: Context, command: InboxCommandOf<'create_quest'>): Promise<Outcome> {
  const id = questIdOfCommand(command, ctx.world.kingdom.tz) ?? ctx.deps.ids.quest();
  if (ctx.world.quests.has(id)) return APPLIED;
  const made = questFromCommand(command.payload, {
    id,
    at: ctx.record.stamp(),
    breakers: ctx.world.kingdom.breakers,
    registry: ctx.world.registry,
    // With the secrets each allows: a quest asking for more is refused here (ADR 0013).
    territories: [...ctx.world.territories.values()],
    quests: [...ctx.world.quests.keys()],
  });
  if (!made.ok) return rejected(made.error.code);
  const type = made.value.status === 'draft' ? 'quest.drafted' : 'quest.created';
  return outcomeOf(await ctx.record.put(made.value, type, OWNER));
}

/** The quest's holders let go of it: the assignee and the verifier whose `current` is this quest. */
function letGo(ctx: Context, quest: Quest): Edits {
  const edits: Record<string, ReturnType<typeof step>> = {};
  for (const id of [quest.assignee, quest.verifier]) {
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

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * An archived quest gives its plot back (§2.5 `done.archive`: the worktree goes at archive, never sooner; its branch
 * stays). A worktree with uncommitted work is refused and stays for the owner (no `--force`, §3.3).
 */
async function releasePlot(ctx: Context, quest: Quest): Promise<void> {
  try {
    const released = await ctx.deps.plots.release(quest.plot);
    if (!released.ok) {
      const { reason, detail } = released.error;
      ctx.deps.log.warn(`steward: ${quest.id}: the plot stays (${reason}): ${detail}`);
      return;
    }
    for (const failure of released.value.forget_failures)
      ctx.deps.log.warn(`steward: ${quest.id}: a tribe's CLI kept data about the plot: ${failure}`);
    // Git and the tribes are done with the plot; only the folder stays, for the owner (P1-11).
    const { leftover } = released.value;
    if (leftover !== undefined)
      ctx.deps.log.warn(`steward: ${quest.id}: the plot's folder stays, remove it by hand: ${leftover}`);
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the plot stays: ${messageOf(error)}`);
  }
}

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
  const asker = ctx.world.characters.get(quest.assignee);
  if (asker?.status !== 'idle' || ctx.deps.runners[asker.tribe] === undefined) return { status: 'waiting' };
  const { kingdom } = ctx.world;
  const mana = { readings: ctx.mana.readings, config: kingdom.mana };
  const open = poolOpenOf({ kingdom, asleep: ctx.mana.asleep, mana }, ctx.deps.clock.now());
  if (!open(asker)) return { status: 'waiting' };
  return outcomeOf(await openAssignee(ctx, quest.id, { kind: 'answer', answer: text }));
}

/** The character the owner named, or the Steward's own choice among the free ones (§2.3 reassign). */
function newAssignee(ctx: Context, quest: Quest, named: string | undefined): Result<Character, string> {
  if (named === undefined) {
    const free = [...ctx.world.characters.values()].filter(
      (c) => c.status === 'idle' && c.id !== quest.assignee && ctx.deps.runners[c.tribe] !== undefined,
    );
    const chosen = selectAssignee(quest, free);
    return chosen === undefined ? { ok: false, error: 'no_candidate' } : { ok: true, value: chosen };
  }
  const character = ctx.world.characters.get(named as Character['id']);
  if (character === undefined) return { ok: false, error: 'unknown_character' };
  if (character.class !== quest.class_required) return { ok: false, error: 'class_mismatch' };
  if (character.status === 'suspended') return { ok: false, error: 'character_suspended' };
  return { ok: true, value: character };
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
  return outcomeOf(await ctx.record.put(changed.value, 'quest.edited', OWNER));
}

/** A plain move of the owner: confirm, retry. */
export const ownerMove = async (ctx: Context, quest: Quest, type: 'confirm' | 'retry'): Promise<Outcome> =>
  outcomeOf(await moveAndRing(ctx, { quest: quest.id, event: { type }, actor: 'user' }));
