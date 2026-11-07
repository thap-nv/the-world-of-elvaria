// A judge's session ends with its verdict (implementation-plan §2.5, §3.2, ADR 0008): the structured output becomes
// a verdict file, the ritual's pass rule has the last word over the checks (a failing check fails the quest), and
// validateVerdict refuses what the doer or a stranger to this session would hand in. Then the quest moves (done,
// awaiting_seal, returned or the infirmary) and the assignee's windows and level follow. A partial verdict says how
// far the judge read; the next judge reads on.
import { partyOf, underPassRule, validateVerdict } from '@elvaria/domain';
import type { Quest, Result, Verdict } from '@elvaria/domain';
import type { RunResult } from '@elvaria/runner-core';

import { moveAndRing } from '../notices.ts';
import { step } from '../record.ts';
import { VERDICT_EVENT, moveOnVerdict, recordVerdict, ritualOf } from '../verdicts.ts';
import { judgeVerdictOf } from './verdict-file.ts';
import type { Context } from '../context.ts';
import type { Running } from '../sessions/running.ts';

export const runOf = (running: Running, result: RunResult) => ({
  session_id: result.session_id === '' ? running.session_id : result.session_id,
  tokens: result.usage.tokens,
});

/** The verifier leaves without a verdict (§2.5 `review.crash`): the next verifier takes the review. */
export const verifierLeaves = (ctx: Context, running: Running, result: RunResult) =>
  moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'crash', ...runOf(running, result) },
    actor: 'steward',
    edits: { [running.character]: step('unassign') },
  });

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
  if (!verdict.ok) return verdict;
  const rule = ritual.pass_rule;
  const valid = validateVerdict(
    underPassRule(verdict.value, rule),
    quest,
    rule,
    partyOf(quest, [...ctx.world.quests.values()]),
  );
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
    ctx.deps.log.warn(`steward: ${quest.id}: the verifier's output is no verdict (${verdict.error})`);
    return verifierLeaves(ctx, running, result);
  }
  const actor = { kind: 'character', id: running.character } as const;
  const written = await recordVerdict(ctx, quest, verdict.value, actor);
  if (!written.ok) {
    ctx.deps.log.warn(`steward: ${quest.id}: the verdict could not be written: ${written.error}`);
    return verifierLeaves(ctx, running, result);
  }
  const outcome = verdict.value;
  // A partial verdict says how far the verifier read (`progress`); the next verifier reads on (§2.5).
  if (outcome.result === 'partial') return verifierLeaves(ctx, running, result);
  return moveOnVerdict(
    ctx,
    quest,
    { ...outcome, result: outcome.result },
    {
      event: { type: VERDICT_EVENT[outcome.result], ...runOf(running, result) },
      actor: 'verifier',
      edits: { [running.character]: step('verdict') },
      reason: 'max_attempts',
    },
  );
}
