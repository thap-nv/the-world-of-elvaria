// What a session's end does to its quest (implementation-plan §2.5, §3.7): the runner's RunResult becomes one move
// of the table, the character's matching move, and for a verifier the verdict, the assignee's reputation and level.
// An end that arrives for a quest that moved on meanwhile (cancelled, reassigned) changes nothing.
import { currentRun } from '@elvaria/domain';
import { plotCommitMessage } from '@elvaria/runner-core';
import type { BreakerTrip, Quest, Result } from '@elvaria/domain';
import type { CommitOutcome, RunResult } from '@elvaria/runner-core';

import { moveAndRing } from '../notices.ts';
import { step } from '../record.ts';
import { judge, runOf, verifierLeaves } from '../review/judge.ts';
import type { Context } from '../context.ts';
import type { Finished, Running } from './running.ts';

/** The CLI's own limits are breakers (§3.4): max_turns trips `turns`, an exhausted budget trips `tokens`. */
const TRIPS = { max_turns: 'turns', budget: 'tokens' } as const;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function breaker(
  ctx: Context,
  running: Running,
  result: RunResult,
  trip: BreakerTrip,
  detail?: string,
) {
  const who = running.character;
  // The character is bogged down while the Steward ends the session, then free again (§2.6 "Sa lầy").
  await ctx.record.change(who, 'character.swamp', step('breaker'));
  return moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'breaker', trip, ...runOf(running, result) },
    actor: 'steward',
    edits: { [who]: step('quest_infirmary') },
    reason: detail === undefined ? `breaker:${trip}` : `breaker:${trip}: ${detail}`,
  });
}

/**
 * Commits the finished work before review (§3.3, P1-07): five classes have no git of their own, and the judge reads
 * the branch's diff. The territory's hooks may refuse; a failing git is a refusal too, never a bypass.
 */
async function commitSubmitted(ctx: Context, running: Running): Promise<CommitOutcome> {
  const quest = ctx.world.quests.get(running.quest);
  if (quest === undefined) return { status: 'no_git' };
  try {
    return await ctx.deps.plots.commit(quest.plot, plotCommitMessage.submit(quest.id));
  } catch (error) {
    return { status: 'refused', detail: messageOf(error) };
  }
}

async function settleAssignee(
  ctx: Context,
  running: Running,
  result: RunResult,
): Promise<Result<Quest, string>> {
  const who = running.character;
  const run = runOf(running, result);
  const quest = running.quest;
  if (result.rate_limited)
    return moveAndRing(ctx, {
      quest,
      event: { type: 'mana_out', ...run },
      actor: 'mana',
      edits: { [who]: step('mana_out') },
    });
  if (result.outcome === 'max_turns' || result.outcome === 'budget')
    return breaker(ctx, running, result, TRIPS[result.outcome]);
  if (result.outcome !== 'completed')
    return moveAndRing(ctx, {
      quest,
      event: { type: 'crash', ...run },
      actor: 'steward',
      edits: { [who]: step('crash') },
    });
  if (result.question !== undefined)
    return moveAndRing(ctx, {
      quest,
      event: { type: 'ask', question: result.question, ...run },
      actor: 'runner',
      edits: { [who]: step('ask') },
    });
  const committed = await commitSubmitted(ctx, running);
  // The branch would lack the work: the quest goes to the infirmary with the hook's last words, not to review.
  if (committed.status === 'refused') return breaker(ctx, running, result, 'commit', committed.detail);
  return moveAndRing(ctx, {
    quest,
    event: { type: 'submit', ...run },
    actor: 'runner',
    edits: { [who]: step('submit') },
  });
}

async function settleVerifier(
  ctx: Context,
  quest: Quest,
  running: Running,
  result: RunResult,
): Promise<Result<Quest, string>> {
  if (result.rate_limited)
    return moveAndRing(ctx, {
      quest: running.quest,
      event: { type: 'mana_out', ...runOf(running, result) },
      actor: 'mana',
      edits: { [running.character]: step('mana_out') },
    });
  if (result.outcome === 'completed') return judge(ctx, quest, running, result);
  return verifierLeaves(ctx, running, result);
}

/** The quest, while the session is still the one its file says runs: same status, same holder, same run. */
function current(ctx: Context, running: Running): Quest | undefined {
  const quest = ctx.world.quests.get(running.quest);
  if (quest === undefined || currentRun(quest) !== running.n) return undefined;
  const holds =
    running.role === 'assignee'
      ? quest.status === 'working' && quest.assignee === running.character
      : quest.status === 'review' && quest.verifier === running.character;
  return holds ? quest : undefined;
}

export async function settle(ctx: Context, { running, result }: Finished): Promise<void> {
  ctx.counts.ended += 1;
  const quest = current(ctx, running);
  if (quest === undefined) return;
  const settled =
    running.role === 'assignee'
      ? await settleAssignee(ctx, running, result)
      : await settleVerifier(ctx, quest, running, result);
  if (!settled.ok)
    ctx.deps.log.warn(
      `steward: ${running.quest}: the end of ${running.character}'s session: ${settled.error}`,
    );
}

/**
 * A quest the files say runs a session this Steward does not hold: the Steward stopped or crashed under it, or the
 * end could not be recorded. Its session is gone, so the run ends as a crash: the assignee tries again in a fresh
 * session, a verifier leaves the review to the next one. No quest ever runs two sessions (§3.1).
 */
export async function reapLost(ctx: Context): Promise<void> {
  for (const quest of [...ctx.world.quests.values()]) {
    if (ctx.sessions.get(quest.id) !== undefined || quest.tier !== 'session') continue;
    const holder =
      quest.status === 'working' ? quest.assignee : quest.status === 'review' ? quest.verifier : null;
    if (typeof holder !== 'string') continue;
    const character = ctx.world.characters.get(holder);
    const holds = character?.current?.quest === quest.id;
    const edit = step(quest.status === 'working' ? 'crash' : 'unassign');
    const moved = await moveAndRing(ctx, {
      quest: quest.id,
      event: { type: 'crash' },
      actor: 'steward',
      edits: holds ? { [holder]: edit } : {},
    });
    if (!moved.ok) ctx.deps.log.warn(`steward: ${quest.id}: a lost session: ${moved.error}`);
    else ctx.deps.log.warn(`steward: ${quest.id}: ${holder}'s session was lost; the run ended as a crash`);
  }
}
