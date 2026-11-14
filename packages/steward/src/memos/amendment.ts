// Amendments as the Steward settles them (PS-22b, implementation-plan §3.16.2, ADR 0024); who wrote a quest's
// description routes its doer's amendment when it is filed (authoring.ts). The author's decision comes
// back as one decide_amendment command: an acceptance rewrites the description, and adds the memo's refs to the
// quest's scope (fix/amendment-flow), while no session holds the quest; either decision closes the memo and lets the quest that waits on it go on, the note as the answer to its doer;
// a referral hands it to the owner, who answers it as a question. The owner may also settle it first, by answering
// the quest or deciding the memo. Nothing here asks a memo's kind: the memo's route and the quest's `blocked` say it.
import { AMENDABLE_STATUSES, amendedScopeOf, editQuest, escalateMemo, sharedGlobsOf } from '@elvaria/domain';
import type { Actor, BlockedAmendment, CommandPayload, InboxCommandOf, Memo, Quest } from '@elvaria/domain';

import { APPLIED, answer, answerWaits, rejected } from '../inbox/quest-commands.ts';
import { noticeQuest, ring } from '../context.ts';
import { CHANCELLOR, OWNER } from '../record.ts';
import { writeClosed } from './close.ts';
import type { Context } from '../context.ts';
import type { Outcome } from '../inbox/quest-commands.ts';

/** The quest waits on `memo`, undecided: blocked on it, its answer not given. */
const waitsOn = (
  quest: Quest | undefined,
  memo: Memo['id'],
): quest is Quest & { blocked: { amendment: BlockedAmendment } } =>
  quest?.status === 'blocked' &&
  quest.blocked?.amendment?.memo === memo &&
  quest.blocked.answer === undefined;

/** Whose decision it was: the mage the memo names, else the Chancellor (ADR 0024: the line tells who decided). */
const authorActorOf = (memo: Memo): Actor =>
  memo.to.author === undefined ? CHANCELLOR : { kind: 'character', id: memo.to.author };

/** `blocked.amendment` updated, the quest written with a quest.edited line told as `actor`'s. */
async function setAmendment(
  ctx: Context,
  quest: Quest & { blocked: { amendment: BlockedAmendment } },
  change: Partial<BlockedAmendment>,
  actor: Actor,
  question = quest.blocked.question,
): Promise<boolean> {
  const amendment = { ...quest.blocked.amendment, ...change };
  const blocked = { ...quest.blocked, question, amendment };
  const put = await ctx.record.put(
    { ...quest, blocked, updated_at: ctx.record.stamp() },
    'quest.edited',
    actor,
  );
  if (!put.ok) ctx.deps.log.warn(`steward: ${quest.id}: its amendment was not updated: ${put.error}`);
  return put.ok;
}

/**
 * The quest as accepted, while no session holds it and its work is not judged: the description rewritten, and the
 * memo's refs outside its scope added to it (amendedScopeOf, fix/amendment-flow), so the doer may change those files
 * and the owner no longer opens the scope by hand. A description changed since the author read it keeps the owner's
 * change (warned) while the scope still grows: adding refs overwrites nothing. A quest a session holds keeps both
 * (warned): the doer reads the decision then.
 */
async function rewrite(
  ctx: Context,
  quest: Quest | undefined,
  memo: Memo,
  payload: CommandPayload<'decide_amendment'>,
  actor: Actor,
): Promise<void> {
  if (quest === undefined) return;
  const { description, expected_updated_at: read } = payload;
  const describes = description !== undefined && description !== quest.description;
  const shared = sharedGlobsOf(ctx.world.territories.get(quest.territory));
  const scope = amendedScopeOf(quest.scope_paths, memo.refs, shared);
  if (!describes && scope === undefined) return;
  const amendable = (AMENDABLE_STATUSES as readonly string[]).includes(quest.status);
  const fresh = describes && read === quest.updated_at;
  const changes = {
    ...(fresh ? { description } : {}),
    ...(scope === undefined ? {} : { scope_paths: scope }),
  };
  const edit = { quest: quest.id, expected_updated_at: quest.updated_at, changes };
  const tried = amendable && (fresh || scope !== undefined);
  const changed = tried ? editQuest(quest, edit, { at: ctx.record.stamp(), quests: [] }) : undefined;
  const put = changed?.ok === true ? await ctx.record.put(changed.value, 'quest.edited', actor) : undefined;
  const kept = [
    ...(describes && (put?.ok !== true || !fresh) ? ['description'] : []),
    ...(scope !== undefined && put?.ok !== true ? ['scope'] : []),
  ];
  if (kept.length > 0)
    ctx.deps.log.warn(
      `steward: ${quest.id}: the accepted amendment ${payload.memo} leaves its ${kept.join(' and ')} as it is`,
    );
}

/**
 * The quest waiting on the memo goes on: its decision on `blocked.amendment`, the note as the answer. Undefined when
 * nothing waited; a quest whose doer cannot go on now is the owner's to answer (questViewOf shows it once decided).
 */
async function goOn(
  ctx: Context,
  memo: Memo,
  decision: BlockedAmendment['decision'],
  note: string,
  actor: Actor,
): Promise<Outcome | undefined> {
  const quest = ctx.world.quests.get(memo.quest);
  if (!waitsOn(quest, memo.id)) return undefined;
  if (!(await setAmendment(ctx, quest, { decision }, actor))) return undefined;
  const now = ctx.world.quests.get(memo.quest);
  return now === undefined ? undefined : answer(ctx, now, note);
}

/** The author hands the amendment to the owner: its advice on the memo, the quest's question now the owner's. */
async function referToOwner(
  ctx: Context,
  memo: Memo,
  payload: CommandPayload<'decide_amendment'>,
  actor: Actor,
): Promise<Outcome> {
  const advice = {
    action: 'owner',
    holds: payload.holds ?? ['chancellor_asks'],
    note: payload.note,
  } as const;
  const sent = escalateMemo(memo, advice, ctx.record.stamp());
  if (!sent.ok) return rejected(sent.error.code === 'closed' ? 'memo_closed' : 'memo_escalated');
  const written = await ctx.deps.store.memos.write(sent.value);
  if (!written.ok) return rejected(written.error.code);
  const quest = ctx.world.quests.get(memo.quest);
  const data = { memo: memo.id, action: advice.action, holds: advice.holds };
  await ctx.record.note({ type: 'memo.escalated', actor, data, ...(quest === undefined ? {} : { quest }) });
  if (!waitsOn(quest, memo.id)) return APPLIED;
  // The owner reads the amendment and the author's why together, and the bell rings once (§2.5 question).
  const question = `${memo.body}\n\n${payload.note}`;
  if (await setAmendment(ctx, quest, { by: 'owner' }, actor, question)) {
    const now = ctx.world.quests.get(memo.quest);
    if (now !== undefined) await ring(ctx, { kind: 'question', quest: noticeQuest(now), question });
  }
  return APPLIED;
}

/** `decide_amendment`: the author's decision, from the Chancellor's office (source `chancellor`). */
export async function decideAmendment(
  ctx: Context,
  command: InboxCommandOf<'decide_amendment'>,
): Promise<Outcome> {
  const { payload } = command;
  const read = await ctx.deps.store.memos.read(payload.memo);
  if (!read.ok) return rejected(read.error.code === 'not_found' ? 'unknown_memo' : read.error.code);
  const memo = read.value;
  if (memo.state === 'closed') return rejected('memo_closed');
  if (memo.to.route !== 'author') return rejected('not_to_author');
  if (memo.escalation !== undefined) return rejected('memo_escalated');
  const actor = authorActorOf(memo);
  if (payload.decision === 'owner') return referToOwner(ctx, memo, payload, actor);
  const quest = ctx.world.quests.get(memo.quest);
  if (waitsOn(quest, memo.id) && answerWaits(ctx, quest)) return { status: 'waiting' };
  if (payload.decision === 'accepted') await rewrite(ctx, quest, memo, payload, actor);
  const closed = await writeClosed(ctx, memo, { decision: payload.decision, note: payload.note }, actor);
  if (!closed.ok) return rejected(closed.error);
  return (await goOn(ctx, memo, payload.decision, payload.note, actor)) ?? APPLIED;
}

/** The memo closed as handled by its own quest, with the owner's answer, unless it is closed already. */
async function closeAnswered(ctx: Context, id: Memo['id'], quest: Quest['id'], text: string): Promise<void> {
  const read = await ctx.deps.store.memos.read(id);
  if (read.ok && read.value.state === 'open')
    await writeClosed(ctx, read.value, { decision: 'handled', quest, note: text }, OWNER);
}

/**
 * The owner's answer to a quest (`elvaria answer`). One that waits on an amendment takes the owner's word as its
 * decision, whoever decided it before (a decision whose doer could not go on is the owner's to answer): the doer reads
 * "the owner answered", and a memo still open closes as handled by its own quest.
 */
export async function answerQuest(ctx: Context, quest: Quest, text: string): Promise<Outcome> {
  const memo = quest.status === 'blocked' ? quest.blocked?.amendment?.memo : undefined;
  if (memo === undefined || !waitsOn(quest, memo)) return answer(ctx, quest, text);
  if (answerWaits(ctx, quest)) return { status: 'waiting' };
  if (quest.blocked.amendment.by !== 'owner' && !(await setAmendment(ctx, quest, { by: 'owner' }, OWNER)))
    return rejected('not_written');
  const now = ctx.world.quests.get(quest.id) ?? quest;
  const answered = await answer(ctx, now, text);
  if (answered.status === 'applied') await closeAnswered(ctx, memo, quest.id, text);
  return answered;
}

/**
 * The owner decided an amendment its quest waits on (`elvaria memo decide`): the quest goes on as after the author's
 * decision, the owner's note (or the decision itself) as the answer. Waits, writing nothing, while the doer cannot
 * go on; undefined when no quest waits on the memo, which then closes as any other.
 */
export async function ownerDecides(
  ctx: Context,
  memo: Memo,
  payload: CommandPayload<'decide_memo'>,
): Promise<Outcome | undefined> {
  const quest = ctx.world.quests.get(memo.quest);
  if (!waitsOn(quest, memo.id)) return undefined;
  if (answerWaits(ctx, quest)) return { status: 'waiting' };
  if (!(await setAmendment(ctx, quest, { by: 'owner', decision: payload.decision }, OWNER)))
    return rejected('not_written');
  const closed = await writeClosed(ctx, memo, payload, OWNER);
  if (!closed.ok) return rejected(closed.error);
  const now = ctx.world.quests.get(memo.quest);
  return now === undefined ? APPLIED : answer(ctx, now, payload.note ?? payload.decision);
}
