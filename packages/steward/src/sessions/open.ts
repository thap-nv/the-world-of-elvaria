// Opening a session (implementation-plan §3.1 steps 4–6, §2.5): the plot, the request, the spawn, then the quest's
// move with the session's id and the character's move with it. A move the state machine refuses kills the session
// it was for, so no session ever runs for a quest the files do not say it runs for.
import { currentRun, err, ok } from '@elvaria/domain';
import type { CharacterId, Quest, QuestId, Result } from '@elvaria/domain';
import type { AgentRunner, Continuation, RunningSession } from '@elvaria/runner-core';

import { step } from '../record.ts';
import { continuationOf, requestOf } from './request.ts';
import type { Context } from '../context.ts';
import type { MovePayload } from '../record.ts';
import type { SessionInput } from './request.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The quest, the character and the runner a session needs; a gap is a reason not to open it. */
function partsOf(ctx: Context, questId: QuestId, characterId: CharacterId | null | undefined) {
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return err('unknown_quest');
  const character = typeof characterId === 'string' ? ctx.world.characters.get(characterId) : undefined;
  if (character === undefined) return err('unknown_character');
  const territory = ctx.world.territories.get(quest.territory);
  if (territory === undefined) return err('unknown_territory');
  const runner: AgentRunner | undefined = ctx.deps.runners[character.tribe];
  if (runner === undefined) return err('no_runner');
  return ok({ quest, character, territory, runner });
}

/** Prepares the plot, builds the request and spawns; the session and the plot the quest gets. */
async function spawnFor(
  ctx: Context,
  runner: AgentRunner,
  input: Omit<SessionInput, 'cwd'>,
): Promise<Result<{ session: RunningSession; plot: Quest['plot'] }, string>> {
  try {
    const prepared = await ctx.deps.plots.prepare(input.quest, input.territory);
    const quest = { ...input.quest, plot: prepared.plot };
    const request = await requestOf(ctx, { ...input, quest, cwd: prepared.cwd });
    return ok({ session: await runner.spawn(request), plot: prepared.plot });
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${input.quest.id}: no session for ${input.character.id}: ${messageOf(error)}`,
    );
    return err('spawn_failed');
  }
}

export type Opening =
  | { readonly kind: 'start' }
  | { readonly kind: 'redispatch' }
  /** The owner's answer to the character's question: the same attempt goes on in a fresh session (§2.5). */
  | { readonly kind: 'answer'; readonly answer: string };

async function continuationFor(ctx: Context, quest: Quest, opening: Opening): Promise<Continuation | null> {
  if (opening.kind === 'answer') return { reason: 'revive' };
  // A start after earlier runs (the owner gave the quest to someone new) goes on from the letter, like a revival.
  if (opening.kind === 'start' && currentRun(quest) === 0) return null;
  return continuationOf(ctx, quest);
}

function eventOf(opening: Opening, session_id: string): MovePayload {
  if (opening.kind === 'answer') return { type: 'answer', answer: opening.answer, session_id };
  return { type: opening.kind, session_id };
}

/**
 * The assignee's session on `questId`: a start (claimed → working), a redispatch (returned → working) or the
 * owner's answer (blocked → working). A start that cannot spawn releases the claim (§2.5 `claimed.release`).
 */
export async function openAssignee(
  ctx: Context,
  questId: QuestId,
  opening: Opening,
): Promise<Result<Quest, string>> {
  const parts = partsOf(ctx, questId, ctx.world.quests.get(questId)?.assignee);
  if (!parts.ok) return parts;
  const { quest, character, territory, runner } = parts.value;
  const n = opening.kind === 'answer' ? currentRun(quest) : currentRun(quest) + 1;
  // The prompt of an answered question reads the answer from the quest (§2.4).
  const seen =
    opening.kind === 'answer' && quest.blocked !== undefined
      ? { ...quest, blocked: { ...quest.blocked, answer: opening.answer } }
      : quest;
  const continuation = await continuationFor(ctx, quest, opening);
  const spawned = await spawnFor(ctx, runner, {
    role: 'assignee',
    quest: seen,
    character,
    territory,
    n,
    continuation,
  });
  if (!spawned.ok) {
    if (opening.kind === 'start')
      await ctx.record.move({ quest: questId, event: { type: 'release' }, actor: 'steward' });
    return spawned;
  }
  const { session, plot } = spawned.value;
  const sessionId = await session.session_id;
  const moved = await ctx.record.move({
    quest: questId,
    event: eventOf(opening, sessionId),
    actor: opening.kind === 'answer' ? 'user' : 'steward',
    edits: { [character.id]: step('claim', questId) },
    before: { plot },
  });
  if (!moved.ok) {
    await session.kill(`the quest refused ${opening.kind}: ${moved.error}`);
    return moved;
  }
  ctx.sessions.add({
    quest: questId,
    role: 'assignee',
    n,
    character: character.id,
    session,
    session_id: sessionId,
  });
  ctx.counts.started += 1;
  return moved;
}

/** The verifier's fresh session on a submitted quest (§3.2): it reads the letter and the diff, never a transcript. */
export async function openVerifier(
  ctx: Context,
  questId: QuestId,
  verifierId: CharacterId,
): Promise<Result<Quest, string>> {
  const parts = partsOf(ctx, questId, verifierId);
  if (!parts.ok) return parts;
  const { quest, character, territory, runner } = parts.value;
  const n = currentRun(quest);
  const spawned = await spawnFor(ctx, runner, { role: 'verifier', quest, character, territory, n });
  if (!spawned.ok) return spawned;
  const { session } = spawned.value;
  const sessionId = await session.session_id;
  const moved = await ctx.record.move({
    quest: questId,
    event: { type: 'assign_verifier', verifier: character.id, session_id: sessionId },
    actor: 'steward',
    edits: { [character.id]: step('assign_verify', questId) },
  });
  if (!moved.ok) {
    await session.kill(`the quest refused its verifier: ${moved.error}`);
    return moved;
  }
  ctx.sessions.add({
    quest: questId,
    role: 'verifier',
    n,
    character: character.id,
    session,
    session_id: sessionId,
  });
  ctx.counts.started += 1;
  return moved;
}
