// A healer's session (ADR 0034, plans/healer.md 4.4): planTick chose a healer for a quest whose finished work the
// territory's hooks refused (plan.heals); the Steward opens it in the quest's plot, on the doer's staged work, whose
// tree it keeps first so the settle measures what the healer changed. The prompt is heal.md with the hooks' log, the
// healer's own class and scripture; the session is a doer of the quest (role `assignee`) in the run's `heal/` folder,
// under kingdom.heal's ceilings. The quest's move `heal` writes the healer's entry; quest.assignee stays the doer's.
import { currentRun } from '@elvaria/domain';
import type { CharacterId, Quest, QuestId, Result } from '@elvaria/domain';
import type { Continuation, StagedTree } from '@elvaria/runner-core';

import { step } from '../quest/record.ts';
import { secretsBreaker } from '../sessions/breaker.ts';
import { healDueReasonOf } from '../sessions/continuation.ts';
import { assigneeUnopened } from '../sessions/no-session.ts';
import { keep, partsOf, spawnFor } from '../sessions/open.ts';
import { secretsLacking } from '../sessions/secrets.ts';
import { stagedWorkOf } from './tree.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What the healer reads of its heal: whose work, why the hooks refused it, its part and the limits (heal.md). */
async function healOf(ctx: Context, quest: Quest, staged: StagedTree): Promise<Continuation> {
  // The refusal's reason is on the run's quest.heal_due line; a journal that cannot be read names the plain one.
  const reason = await healDueReasonOf(ctx, quest).catch(() => undefined);
  const { max_files: maxFiles, max_lines: maxLines } = ctx.world.kingdom.heal;
  return {
    reason: 'heal',
    heal: {
      assignee: quest.assignee ?? 'the assignee',
      reason: reason?.code ?? 'breaker:commit',
      staged: staged.files,
      max_files: maxFiles,
      max_lines: maxLines,
    },
  };
}

/** The doer's staged work, or why the Steward cannot measure a heal of it: the quest cannot be healed by a healer. */
async function stagedOf(ctx: Context, quest: Quest): Promise<Result<StagedTree, string>> {
  try {
    const staged = await stagedWorkOf(ctx, quest);
    if (staged !== null) return { ok: true, value: staged };
    return { ok: false, error: "the plot cannot measure a healer's part: it has no git" };
  } catch (error) {
    return { ok: false, error: `the doer's staged work cannot be read: ${messageOf(error)}` };
  }
}

/**
 * Opens `healerId`'s session on `questId` (§2.5 `returned.heal`). A session that cannot open sends the quest to the
 * infirmary with why (`returned.breaker`, no-session.ts), as a doer's redispatch that cannot: the next tick would
 * fail the same way. A move the state machine refuses (the healer is the doer, or judged the quest) kills it.
 */
export async function openHealer(
  ctx: Context,
  questId: QuestId,
  healerId: CharacterId,
): Promise<Result<Quest, string>> {
  const parts = partsOf(ctx, questId, healerId);
  if (!parts.ok) return parts;
  const { quest, character, territory, runner } = parts.value;
  const lacking = await secretsLacking(ctx, quest, territory);
  if (lacking !== undefined) return secretsBreaker(ctx, quest, lacking);
  const staged = await stagedOf(ctx, quest);
  if (!staged.ok) return assigneeUnopened(ctx, quest, 'redispatch', staged.error);
  const n = currentRun(quest);
  const input = { role: 'assignee', quest, character, territory, n } as const;
  const spawned = await spawnFor(ctx, runner, {
    ...input,
    continuation: await healOf(ctx, quest, staged.value),
  });
  if (!spawned.ok) return assigneeUnopened(ctx, quest, 'redispatch', spawned.error);
  const { session, plot, spawned_at: spawnedAt, load_trace: loadTrace } = spawned.value;
  const sessionId = await session.session_id;
  const moved = await ctx.record.move({
    quest: questId,
    event: { type: 'heal', healer: character.id, session_id: sessionId },
    actor: 'steward',
    edits: { [character.id]: step('claim', questId) },
    before: { plot },
    load_trace: loadTrace,
  });
  if (!moved.ok) {
    await session.kill(`the quest refused its healer: ${moved.error}`);
    return moved;
  }
  keep(ctx, {
    quest: questId,
    role: 'assignee',
    n,
    character: character.id,
    model: character.model,
    session,
    session_id: sessionId,
    checks: [],
    spawned_at: spawnedAt,
  });
  return moved;
}
