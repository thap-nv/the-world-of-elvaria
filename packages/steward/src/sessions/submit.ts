// A run that completed without a question (implementation-plan §2.5, §3.3, §3.16.2): the patch, the commit, the
// letter's memos, then the end the domain picks (submitEndOf): the doer's amendment, on which the quest waits for its
// author; else the breaker of a patch or a commit the Steward could not make; else the submit. The memos come before
// that choice, refused work or not: the session ended by itself, so its letter is no hasty one (PS-02), and a doer
// that stops because the fix it needs lies outside its scope leaves exactly the work a hook refuses (gap 16 of the
// PS-07 report: filed after the commit only, such an amendment was lost and the quest went to the infirmary).
import { amendmentDeciderOf, protectedMarkOf, submitEndOf } from '@elvaria/domain';
import { plotCommitMessage } from '@elvaria/runner-core';
import type { Memo, Quest, Result } from '@elvaria/domain';
import type { PatchOutcome, RunResult } from '@elvaria/runner-core';

import { fileMemos } from '../memos/file.ts';
import type { MemoFields } from '../memos/file.ts';
import { moveAndRing } from '../notices.ts';
import { step } from '../record.ts';
import { runOf } from '../review/judge.ts';
import { breakAssignee } from './breaker.ts';
import { commitPlot } from './commit.ts';
import { checksLetterAfter, noteUnchangedLetter } from './letter.ts';
import { outOfScopeIn } from './out-of-scope.ts';
import { applyAssigneePatch } from './patch.ts';
import type { Context } from '../context.ts';
import type { PlotCommit } from './commit.ts';
import type { Running } from './running.ts';

/** The session has ended already: the breaker's `end` is the result it reported. */
export const ended = (result: RunResult) => () => Promise.resolve(result);

/** What the Steward could not make of the run's work: its patch, with why, or its submit commit, the hook's refusal. */
type Refused =
  { readonly patch: string } | { readonly refused: Extract<PlotCommit, { readonly status: 'refused' }> };

function refusedOf(patched: PatchOutcome, committed: PlotCommit | undefined): Refused | undefined {
  if (patched.status === 'refused') return { patch: patched.detail };
  return committed?.status === 'refused' ? { refused: committed } : undefined;
}

/**
 * A tribe without the Stop hook (`handover_check: after_session`, P1-33): a letter still unchanged after the
 * Steward's reminders goes on to review, and the journal tells the judge, as the hook's let-through does (ADR 0010).
 */
async function letLetterThrough(ctx: Context, running: Running, session: string): Promise<void> {
  const quest = ctx.world.quests.get(running.quest);
  const tribe = ctx.world.characters.get(running.character)?.tribe;
  if (quest === undefined || tribe === undefined || !checksLetterAfter(ctx, tribe)) return;
  if (await noteUnchangedLetter(ctx, quest, running.n, session))
    ctx.deps.log.warn(`steward: ${running.quest}: ${running.character} left handover.md unchanged`);
}

/**
 * The patch, the commit, the letter's memos, then the end submitEndOf picks. The submit's line names the files the
 * work changed outside the quest's scope (PS-05). Work that changed a protected path sets the royal seal and the mark
 * that asks for the stronger judge on the quest, before the submit (PS-04, ADR 0026).
 */
export async function submitWork(
  ctx: Context,
  running: Running,
  result: RunResult,
): Promise<Result<Quest, string>> {
  const quest = running.quest;
  await letLetterThrough(ctx, running, runOf(running, result).session_id);
  // What the CLI would not let the assignee write goes in first, as its patch, so the submit carries it (P1-28).
  // A patch that touches other paths or does not apply leaves everything in the plot: no commit is tried.
  const patched = await applyAssigneePatch(ctx, running);
  // Five classes have no git of their own, and the judge reads the branch's diff (§3.3, P1-07).
  const committed =
    patched.status === 'refused' ? undefined : await commitPlot(ctx, quest, plotCommitMessage.submit(quest));
  // A forbidden path changed, which only a program the session's shell ran could do: nothing is committed, and the
  // owner looks at the plot before anything else does, the letter's memos included (P1-49).
  if (committed?.status === 'forbidden')
    return breakAssignee(ctx, running, { trip: 'forbidden_paths', paths: committed.paths }, ended(result));
  const { before, amendment } = await fileMemos(ctx, running);
  const end = submitEndOf(amendment, refusedOf(patched, committed));
  if (end.end === 'amendment')
    return waitOnAmendment(ctx, running, result, { before, amendment: end.amendment }, end.refused);
  // The branch would lack the work: the quest goes to the infirmary with why, not to review, and keeps the pending
  // objection its letter filed for the review after (PS-22).
  if (end.end === 'breaker')
    return breakAssignee(ctx, running, { trip: 'commit', ...end.refused, before }, ended(result));
  const submitted = ctx.world.quests.get(quest);
  const changes =
    committed !== undefined && 'protected_changes' in committed ? committed.protected_changes : [];
  const mark = submitted === undefined ? undefined : protectedMarkOf(submitted, changes);
  return moveAndRing(ctx, {
    quest,
    event: { type: 'submit', ...runOf(running, result) },
    actor: 'runner',
    edits: { [running.character]: step('submit') },
    // The quest's pending objection (PS-22) and the protected paths the work changed (PS-04).
    before: { ...before, ...mark },
    ...(submitted === undefined ? {} : { out_of_scope: await outOfScopeIn(ctx, submitted) }),
  });
}

/**
 * The run ends on the doer's amendment (PS-22b, ADR 0024): its work stays on the branch, unsubmitted, or in the plot
 * when the Steward could not apply its patch or commit it (fix/amendment-flow), and the quest waits as on a question,
 * for its author's decision or the owner's; the same attempt goes on after it, from the plot as it was left.
 */
function waitOnAmendment(
  ctx: Context,
  running: Running,
  result: RunResult,
  { before, amendment }: { readonly before: MemoFields; readonly amendment: Memo },
  refused: Refused | undefined,
): Promise<Result<Quest, string>> {
  if (refused !== undefined) {
    const why = 'patch' in refused ? `its patch was refused: ${refused.patch}` : refused.refused.detail;
    ctx.deps.log.warn(
      `steward: ${running.quest}: the work stays uncommitted in the plot while the quest waits on ${amendment.id}: ${why}`,
    );
  }
  const by = amendmentDeciderOf(amendment.to) ?? 'owner';
  return moveAndRing(ctx, {
    quest: running.quest,
    event: {
      type: 'ask',
      question: amendment.body,
      amendment: { memo: amendment.id, by },
      ...runOf(running, result),
    },
    actor: 'runner',
    edits: { [running.character]: step('ask') },
    before,
  });
}
