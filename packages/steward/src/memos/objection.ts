// What the Steward reads and writes for an objection (PS-22, implementation-plan §3.16.2, ADR 0024, ADR 0008): the
// verdict a run came back with, which an objection in its letter contests; the contested verdict and the memo, for the
// second judge's prompt; and the memo closed by that judge's verdict. The decisions are the domain's (contestRoute,
// objectionOf, objectionOutcomeOf); nothing here asks a memo's kind.
import { closeMemo, objectionOutcomeOf, ownerVerdictIdOf, verdictIdOf } from '@elvaria/domain';
import type { Actor, Contest, Memo, Quest, Verdict } from '@elvaria/domain';
import type { PromptObjection } from '@elvaria/runner-core';

import { OWNER } from '../record.ts';
import type { Context } from '../context.ts';

/**
 * The fail the run `n` came back with, as its prompt read it (continuationOf): the owner's return of run n - 1 first,
 * else the judge's or the machine's verdict on it; undefined after a run that ended without one.
 */
async function returnedWith(ctx: Context, quest: Quest['id'], n: number): Promise<Verdict | undefined> {
  if (n <= 1) return undefined;
  for (const id of [ownerVerdictIdOf({ id: quest }, n - 1), verdictIdOf({ id: quest }, n - 1)]) {
    const verdict = await ctx.deps.store.verdicts.read(id);
    if (verdict.ok && verdict.value.result === 'fail') return verdict.value;
  }
  return undefined;
}

/** The quest's memos, oldest first; a file that cannot be read is left out, as listings do. */
export async function memosOfQuest(ctx: Context, quest: Quest['id']): Promise<Memo[]> {
  const { items } = await ctx.deps.store.memos.list();
  return items
    .filter((memo) => memo.quest === quest)
    .sort((a, b) => a.filed_at.localeCompare(b.filed_at) || a.id.localeCompare(b.id));
}

/** What an objection in the letter of run `n` contests: the verdict it came back with, beside the quest's memos. */
export async function contestOf(
  ctx: Context,
  quest: Quest['id'],
  n: number,
): Promise<Contest & { readonly memos: readonly Memo[] }> {
  return { verdict: await returnedWith(ctx, quest, n), memos: await memosOfQuest(ctx, quest) };
}

/**
 * The objection the quest's judge answers, for its prompt: the contested verdict and the memo. Null without one, or
 * when either file cannot be read: the judge then judges as any other, still never the first one (selectVerifier).
 */
export async function objectionFor(ctx: Context, quest: Quest): Promise<PromptObjection | null> {
  const { objection } = quest;
  if (objection === undefined) return null;
  const [memo, verdict] = await Promise.all([
    ctx.deps.store.memos.read(objection.memo),
    ctx.deps.store.verdicts.read(objection.verdict),
  ]);
  if (memo.ok && verdict.ok) return { verdict: verdict.value, memo: memo.value };
  ctx.deps.log.warn(
    `steward: ${quest.id}: the objection ${objection.memo} cannot be read; its judge reads none`,
  );
  return null;
}

/**
 * The objection `verdict` answered, closed by it (`sustained` on a pass, `overruled` on a fail), with its line in the
 * quest's journal, told as `judge`'s; a partial verdict closes nothing. A memo the owner closed first stays as the
 * owner left it.
 */
export async function closeObjection(
  ctx: Context,
  quest: Quest,
  verdict: Verdict,
  judge: Actor,
): Promise<void> {
  const outcome = objectionOutcomeOf(verdict);
  if (verdict.objection === undefined || outcome === undefined) return;
  const read = await ctx.deps.store.memos.read(verdict.objection.memo);
  const closed = read.ok ? closeMemo(read.value, outcome, ctx.record.stamp()) : undefined;
  if (!closed?.ok) return;
  const written = await ctx.deps.store.memos.write(closed.value);
  if (!written.ok) {
    ctx.deps.log.warn(`steward: ${quest.id}: memos/${verdict.objection.memo}.json was not closed`);
    return;
  }
  await ctx.record.note({
    type: 'memo.closed',
    actor: judge,
    data: { memo: verdict.objection.memo, decision: outcome.decision, verdict: verdict.id },
    quest,
  });
}

/**
 * The owner decided the objection `memo` before its second judge did (decide_memo): the quest whose review owed it a
 * second judge owes none now, and any judge may take it again. A quest whose objection is another memo is left alone.
 */
export async function dropObjection(ctx: Context, memo: Memo['id']): Promise<void> {
  const quest = [...ctx.world.quests.values()].find((candidate) => candidate.objection?.memo === memo);
  if (quest === undefined) return;
  const { objection: _settled, ...rest } = quest;
  const put = await ctx.record.put({ ...rest, updated_at: ctx.record.stamp() }, 'quest.edited', OWNER);
  if (!put.ok)
    ctx.deps.log.warn(`steward: ${quest.id}: its objection stays after memo ${memo}: ${put.error}`);
}
