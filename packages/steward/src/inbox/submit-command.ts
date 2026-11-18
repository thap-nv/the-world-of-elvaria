// `submit` (fix/quest-hold): the owner sends the work a quest in the infirmary holds to review, same run, same attempt
// (§2.5 `infirmary.submit.assignee_last`). A ceiling that cut a session after its work was done sent it there; before,
// the owner ran the checks on the WIP, wrote what was left into the description and reassigned it to the same
// character, a session that only had to submit (run (130), d7). The Steward does what a session's submit does without
// the session (sessions/submit.ts): it applies the assignee's patch for laws.patch_paths, commits what the plot still
// holds, with the territory's hooks, then marks the protected paths the work changed. A judge's session ends with the
// plot put back to its commit (P1-44), so work left uncommitted would be lost: a patch that does not apply, a commit
// the hooks refuse, or a forbidden path changed refuses the command instead and the quest stays where the owner sees it.
import { findTransition, protectedMarkOf } from '@elvaria/domain';
import { plotCommitMessage } from '@elvaria/runner-core';
import type { Quest } from '@elvaria/domain';

import { moveAndRing } from '../notices.ts';
import { lineOf, submitSealOf } from '../seal.ts';
import { commitPlot, forbiddenWip } from '../sessions/commit.ts';
import { applyAssigneePatch } from '../sessions/patch.ts';
import { APPLIED, rejected } from './quest-commands.ts';
import type { Context } from '../context.ts';
import type { Outcome } from './quest-commands.ts';

export async function submitFromInfirmary(ctx: Context, quest: Quest): Promise<Outcome> {
  // The table first: a quest that cannot move gets nothing committed in its plot.
  const row = findTransition(quest, 'submit');
  if (!row.ok) return rejected(row.error.code);
  if (!row.value.actors.includes('user')) return rejected('actor_not_allowed');
  // A cut applies no patch (sessions/breaker.ts), so the one its session wrote is still to apply, as at a submit.
  const patched = await applyAssigneePatch(ctx, quest.id);
  if (patched.status === 'refused') {
    ctx.deps.log.warn(`steward: ${quest.id}: not sent to review, its patch was refused: ${patched.detail}`);
    return rejected('patch_refused');
  }
  const committed = await commitPlot(ctx, quest.id, plotCommitMessage.submit(quest.id));
  if (committed.status === 'forbidden') {
    ctx.deps.log.warn(`steward: ${quest.id}: not sent to review: ${forbiddenWip(committed.paths)}`);
    return rejected('forbidden_paths');
  }
  if (committed.status === 'refused') {
    ctx.deps.log.warn(
      `steward: ${quest.id}: not sent to review, the commit was refused: ${committed.detail}`,
    );
    return rejected('commit_refused');
  }
  const changed = committed.protected_changes ?? [];
  const seal = await submitSealOf(ctx, quest, changed);
  const moved = await moveAndRing(ctx, {
    quest: quest.id,
    event: { type: 'submit' },
    actor: 'user',
    // PS-08b: the delegation's limits raise the seal at this submit as at a session's.
    before: { ...protectedMarkOf(quest, changed), ...seal.before },
    ...lineOf(seal),
  });
  return moved.ok ? APPLIED : rejected(moved.error);
}
