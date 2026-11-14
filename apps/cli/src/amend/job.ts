// The amendments' authors as a job on call of the Steward (PS-22b, implementation-plan §3.16.2; ADR 0024): `elvaria
// run` gives it to the Steward (StewardDeps.onCall), which starts it outside the tick, one job at a time, whenever a
// quest waits on its doer's amendment (JobView.amendments). One run decides one amendment, the oldest whose decision
// is not in the inbox yet and whose author's tribe runs no session (the session lies outside the tribes' slots, as
// the triage's does). The decision is one decide_amendment command of source `chancellor`; no author to speak, or a
// session that failed, hands the amendment to the owner with the reason, so a quest never waits on nobody and no
// session is spent twice on one memo. The Steward's stop ends the session and writes nothing; the next start asks again.
// An author of a tribe held by its CLI's version (the Steward's notices) waits, writing nothing (fix/held-tribe-sessions).
import { amendmentCommand, decideAmendment } from '@elvaria/chancellor';
import type { AmendmentInput, ChancellorFailure } from '@elvaria/chancellor';
import type { InboxCommandInput, MemoId, QuestId, TribeHold } from '@elvaria/domain';
import type { JobRun, JobView, OnCallJob } from '@elvaria/steward';

import { storeIssueLines } from '../issues.ts';
import { commandHeader } from '../quest/send-command.ts';
import { authorTribeOf, authorshipOf, territoryOf } from './author.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners } from '../say/hearing.ts';
import type { Waiting } from './author.ts';

/** The amendments whose decision is in the inbox already, waiting for the Steward to apply it. */
async function decidedInInbox(ctx: KingdomContext): Promise<ReadonlySet<MemoId>> {
  const items = await ctx.store.inbox.read();
  return new Set(
    items.flatMap(({ command }) =>
      command.ok && command.value.kind === 'decide_amendment' ? [command.value.payload.memo] : [],
    ),
  );
}

/** The quest, waiting on its amendment, with the memo; undefined when either file is gone or it waits no more. */
async function waitingOf(ctx: KingdomContext, id: QuestId): Promise<Waiting | undefined> {
  const quests = (await ctx.store.quests.list()).items;
  const quest = quests.find((candidate) => candidate.id === id);
  const memoId = quest?.blocked?.amendment?.memo;
  if (quest === undefined || memoId === undefined) return undefined;
  const memo = await ctx.store.memos.read(memoId);
  return memo.ok && memo.value.state === 'open' ? { quest, memo: memo.value, quests } : undefined;
}

/** The tribes the Steward holds by their CLI's version, as the tick that started the job found them. */
const holdsOf = (view: JobView): readonly TribeHold[] => view.notices.tribes_held ?? [];

/**
 * The first quest of the view the job may decide now: not decided in the inbox, its author's tribe free and not held
 * (fix/held-tribe-sessions: the amendment waits for the check, it does not go to the owner).
 */
async function nextOf(ctx: KingdomContext, runners: Runners, view: JobView): Promise<Waiting | undefined> {
  const decided = await decidedInInbox(ctx);
  for (const id of view.amendments) {
    const waiting = await waitingOf(ctx, id);
    if (waiting === undefined || decided.has(waiting.memo.id)) continue;
    const author = await authorTribeOf(ctx, runners, waiting.memo, holdsOf(view));
    if (author.status === 'none' || (author.status === 'ready' && !view.busy.has(author.tribe)))
      return waiting;
  }
  return undefined;
}

/** Why the author's session failed: the CLI's own line when it ended the session in error (fix/amendment-schema). */
const failedText = (ctx: KingdomContext, failure: ChancellorFailure): string =>
  failure.code === 'cli_error'
    ? ctx.t('cli.amend.cli_error', { line: failure.line })
    : ctx.t('cli.amend.failed', { code: failure.code });

/** Why the owner decides instead, in the owner's language: no author, or the author's session failed. */
const failureNote = (ctx: KingdomContext, failure: ChancellorFailure | undefined): string =>
  failure === undefined ? ctx.t('cli.amend.no_author') : failedText(ctx, failure);

type Decision = AmendmentInput['decision'];

async function send(ctx: KingdomContext, command: InboxCommandInput): Promise<void> {
  const written = await ctx.store.inbox.write(command);
  if (written.ok) return;
  storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
  throw new Error('the decision on the amendment could not be written');
}

/**
 * The author's decision, or the owner's turn; undefined when the Steward stopped the session, or when the author's
 * tribe is held (nothing written: the next tick asks again).
 */
async function decisionOf(ctx: KingdomContext, runners: Runners, waiting: Waiting, run: JobRun) {
  const authorship = await authorshipOf(ctx, runners, waiting, holdsOf(run));
  const owner = (failure?: ChancellorFailure): Decision => ({
    decision: 'owner',
    note: failureNote(ctx, failure),
    ask: [],
  });
  if (authorship.status === 'none') return owner();
  if (authorship.status === 'held') return undefined;
  ctx.io.out(ctx.t('cli.amend.listening', { memo: waiting.memo.id, quest: waiting.quest.id }));
  const reply = await decideAmendment(authorship.context, authorship.session, run.signal);
  if (reply.ok) return reply.value.decision;
  if (reply.error.code === 'stopped') return undefined;
  ctx.io.err(failedText(ctx, reply.error));
  ctx.io.err(ctx.t('cli.say.run_dir', { dir: authorship.session.run_dir }));
  return owner(reply.error);
}

async function decide(ctx: KingdomContext, runners: Runners, waiting: Waiting, run: JobRun) {
  const decision = await decisionOf(ctx, runners, waiting, run);
  if (decision === undefined) return;
  const { command, holds } = amendmentCommand({
    decision,
    memo: waiting.memo,
    quest: waiting.quest,
    territory: await territoryOf(ctx, waiting.quest),
    delegation: ctx.kingdom.delegation,
    header: { ...commandHeader(ctx), source: 'chancellor' },
  });
  await send(ctx, command);
  const told = { memo: waiting.memo.id, quest: waiting.quest.id, decision: command.payload.decision };
  ctx.io.out(ctx.t('cli.amend.decided', { ...told, holds: holds.join(', ') || '—' }));
}

export function amendmentJob(ctx: KingdomContext, runners: Runners): OnCallJob {
  return {
    id: 'amendment',
    ready: async (view) => view.amendments.length > 0 && (await nextOf(ctx, runners, view)) !== undefined,
    run: async (run: JobRun) => {
      const waiting = await nextOf(ctx, runners, run);
      if (waiting !== undefined) await decide(ctx, runners, waiting, run);
    },
  };
}
