// What a session's end does to its quest (implementation-plan §2.5, §3.7): the runner's RunResult becomes one move
// of the table, the character's matching move, and for a verifier the verdict, the assignee's reputation and level.
// An end that arrives for a quest that moved on meanwhile (cancelled, reassigned) changes nothing.
import { currentRun } from '@elvaria/domain';
import type { Quest, Result } from '@elvaria/domain';
import type { RunResult } from '@elvaria/runner-core';

import { moveAndRing } from '../notices.ts';
import { step } from '../record.ts';
import { judged, levelAfterVerdict, verdictOf } from '../verdicts.ts';
import type { Context } from '../context.ts';
import type { Finished, Running } from './running.ts';

const runOf = (running: Running, result: RunResult) => ({
  session_id: result.session_id === '' ? running.session_id : result.session_id,
  tokens: result.usage.tokens,
});

/** The CLI's own limits are breakers (§3.4): max_turns trips `turns`, an exhausted budget trips `tokens`. */
const TRIPS = { max_turns: 'turns', budget: 'tokens' } as const;

async function breaker(ctx: Context, running: Running, result: RunResult, trip: 'turns' | 'tokens') {
  const who = running.character;
  // The character is bogged down while the Steward ends the session, then free again (§2.6 "Sa lầy").
  await ctx.record.change(who, 'character.swamp', step('breaker'));
  return moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'breaker', trip, ...runOf(running, result) },
    actor: 'steward',
    edits: { [who]: step('quest_infirmary') },
    reason: `breaker:${trip}`,
  });
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
  // P1-07 commits the plot here first ("submit: <quest>"), for the classes that have no git of their own.
  return moveAndRing(ctx, {
    quest,
    event: { type: 'submit', ...run },
    actor: 'runner',
    edits: { [who]: step('submit') },
  });
}

/** The verifier leaves without a verdict (§2.5 `review.crash`): the next verifier takes the review. */
const verifierLeaves = (ctx: Context, running: Running, result: RunResult) =>
  moveAndRing(ctx, {
    quest: running.quest,
    event: { type: 'crash', ...runOf(running, result) },
    actor: 'steward',
    edits: { [running.character]: step('unassign') },
  });

async function judge(
  ctx: Context,
  quest: Quest,
  running: Running,
  result: RunResult,
): Promise<Result<Quest, string>> {
  const run = runOf(running, result);
  const verdict = verdictOf(
    ctx,
    quest,
    { n: running.n, verifier: running.character, session_id: run.session_id },
    result.structured,
  );
  if (!verdict.ok) {
    ctx.deps.log.warn(`steward: ${quest.id}: the verifier's output is no verdict (${verdict.error})`);
    return verifierLeaves(ctx, running, result);
  }
  const written = await ctx.deps.store.verdicts.write(verdict.value);
  if (!written.ok) return verifierLeaves(ctx, running, result);
  const { result: outcome, id, fail_kind: failKind } = verdict.value;
  const actor = { kind: 'character', id: running.character } as const;
  const data = { verdict: id, ...(failKind === undefined ? {} : { fail_kind: failKind }) };
  await ctx.record.note({ type: `verdict.${outcome}`, actor, data, quest, session: run.session_id });
  // A partial verdict says how far the verifier read (`progress`); the next verifier reads on (§2.5).
  if (outcome === 'partial' || typeof quest.assignee !== 'string')
    return verifierLeaves(ctx, running, result);
  const assignee = quest.assignee;
  const moved = await moveAndRing(ctx, {
    quest: quest.id,
    event: { type: outcome === 'pass' ? 'verdict_pass' : 'verdict_fail', ...run },
    actor: 'verifier',
    edits: { [running.character]: step('verdict'), [assignee]: judged(quest, id, outcome) },
    reason: 'max_attempts',
  });
  const judgedAssignee = ctx.world.characters.get(assignee);
  if (moved.ok && judgedAssignee !== undefined) await levelAfterVerdict(ctx, judgedAssignee);
  return moved;
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
