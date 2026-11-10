// A judge's session ends with its verdict (implementation-plan §2.5, §3.2, ADR 0008): the structured output becomes
// a verdict file, the ritual's pass rule has the last word over the checks (a failing check fails the quest), and
// validateVerdict refuses what the doer or a stranger to this session would hand in. Then the quest moves (done,
// awaiting_seal, returned or the infirmary) and the assignee's windows and level follow. A partial verdict says how
// far the judge read; the next judge reads on, up to REVIEW_PARTIALS_MAX of them (P1-42). A judge that leaves no
// verdict at all counts toward a stalled review (P1-33), as a judge a breaker stopped does.
import {
  partialsStalled,
  partyOf,
  reviewBreaksOf,
  reviewPartialsOf,
  reviewStalled,
  underPassRule,
  validateVerdict,
  withBreaksWeighed,
} from '@elvaria/domain';
import type { Quest, Result, Verdict } from '@elvaria/domain';
import type { RunResult } from '@elvaria/runner-core';

import { OUT_OF_ATTEMPTS } from '../infirmary.ts';
import { moveAndRing } from '../notices.ts';
import { step } from '../record.ts';
import { VERDICT_EVENT, moveOnVerdict, recordVerdict, ritualOf } from '../verdicts.ts';
import { openFlakyFollowUp } from './scratch.ts';
import { judgeVerdictOf, refusalText } from './verdict-file.ts';
import type { Context } from '../context.ts';
import type { Running } from '../sessions/running.ts';

export const runOf = (running: Running, result: RunResult) => ({
  session_id: result.session_id === '' ? running.session_id : result.session_id,
  tokens: result.usage.tokens,
});

/**
 * After a verifier left `left` without a verdict: the REVIEW_BREAKS_MAX-th of the run sends the review to the
 * infirmary with the bell (§2.5 `review.crash.needs_verifier`, P1-33), where the owner sees `why` the last one left;
 * a judge whose output is never a verdict would otherwise open a session every tick.
 */
export function stallWithoutVerdict(
  ctx: Context,
  left: Result<Quest, string>,
  why: string | undefined,
): Promise<Result<Quest, string>> {
  if (!left.ok || !reviewStalled(left.value)) return Promise.resolve(left);
  const said = why === undefined ? {} : { message: why };
  return moveAndRing(ctx, {
    quest: left.value.id,
    event: { type: 'crash' },
    actor: 'steward',
    infirmary: { trip: 'no_verdict', detail: { ...said, verifiers_stopped: reviewBreaksOf(left.value) } },
  });
}

/**
 * The verifier leaves without a verdict (§2.5 `review.crash`): the next verifier takes the review, unless this was
 * the run's REVIEW_BREAKS_MAX-th to leave so (stallWithoutVerdict). `why`: what the log and the owner are told.
 */
export async function verifierLeaves(
  ctx: Context,
  running: Running,
  result: RunResult,
  why?: string,
): Promise<Result<Quest, string>> {
  const left = await moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'crash', ...runOf(running, result) },
    actor: 'steward',
    edits: { [running.character]: step('unassign') },
  });
  return stallWithoutVerdict(ctx, left, why);
}

/**
 * A partial verdict says how far the judge read (`progress`): it leaves, and the next judge reads on (§2.5). The
 * REVIEW_PARTIALS_MAX-th of the run sends the review to the infirmary with the bell instead (§2.5
 * `review.verdict_partial.needs_verifier`, P1-42): a judge that cannot finish the ritual, its shell unable to run
 * the checks or its pass short of breaks, would be followed by another for ever, each with a session and a trial.
 */
async function verifierHandsInPart(
  ctx: Context,
  running: Running,
  result: RunResult,
  partial: Verdict,
): Promise<Result<Quest, string>> {
  const left = await moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'verdict_partial', ...runOf(running, result) },
    actor: 'verifier',
    edits: { [running.character]: step('unassign') },
  });
  if (!left.ok || !partialsStalled(left.value)) return left;
  const stop = partial.progress?.checked_until;
  const said = stop === undefined ? {} : { message: `the last judge stopped at ${stop}` };
  return moveAndRing(ctx, {
    quest: left.value.id,
    event: { type: 'verdict_partial' },
    actor: 'steward',
    infirmary: {
      trip: 'partial_verdicts',
      detail: { ...said, partial_verdicts: reviewPartialsOf(left.value) },
    },
  });
}

/** The verdict as the pass rule and the separation of duties have it, or why the Steward writes none. */
function ruledVerdict(
  ctx: Context,
  quest: Quest,
  running: Running,
  result: RunResult,
): Result<Verdict, string> {
  const ritual = ritualOf(ctx, quest);
  if (ritual === undefined) return { ok: false, error: 'unknown_ritual' };
  const run = {
    ritual: ritual.id,
    n: running.n,
    verifier: running.character,
    session_id: runOf(running, result).session_id,
    checks: running.checks,
  };
  const verdict = judgeVerdictOf(ctx, quest, run, result.structured);
  if (!verdict.ok) return { ok: false, error: refusalText(verdict.error) };
  const rule = ritual.pass_rule;
  // The machine first (a failing check fails the quest), then the judge's evidence: a pass in a scratch plot that
  // names too few breaks is a partial, and the next judge reads on from break_and_expect_red (P1-40).
  const machine = underPassRule(verdict.value, rule);
  const ruled = withBreaksWeighed(machine, quest, ctx.world.registry);
  if (ruled !== machine)
    ctx.deps.log.warn(
      `steward: ${quest.id}: a pass without its breaks in the scratch plot is taken as partial`,
    );
  const valid = validateVerdict(ruled, quest, rule, partyOf(quest, [...ctx.world.quests.values()]));
  return valid.ok ? valid : { ok: false, error: valid.error.code };
}

export async function judge(
  ctx: Context,
  quest: Quest,
  running: Running,
  result: RunResult,
): Promise<Result<Quest, string>> {
  const verdict = ruledVerdict(ctx, quest, running, result);
  if (!verdict.ok) {
    const why = `the verifier's output is no verdict (${verdict.error})`;
    ctx.deps.log.warn(`steward: ${quest.id}: ${why}`);
    return verifierLeaves(ctx, running, result, why);
  }
  const actor = { kind: 'character', id: running.character } as const;
  const written = await recordVerdict(ctx, quest, verdict.value, actor);
  if (!written.ok) {
    const why = `the verdict could not be written: ${written.error}`;
    ctx.deps.log.warn(`steward: ${quest.id}: ${why}`);
    return verifierLeaves(ctx, running, result, why);
  }
  const outcome = verdict.value;
  if (outcome.result === 'partial') return verifierHandsInPart(ctx, running, result, outcome);
  // A flake fails the quest and opens the quest that exorcises it (P1-20), before the quest moves on.
  if (outcome.result === 'fail') await openFlakyFollowUp(ctx, quest, outcome);
  return moveOnVerdict(
    ctx,
    quest,
    { ...outcome, result: outcome.result },
    {
      event: { type: VERDICT_EVENT[outcome.result], ...runOf(running, result) },
      actor: 'verifier',
      edits: { [running.character]: step('verdict') },
      infirmary: OUT_OF_ATTEMPTS,
    },
  );
}
