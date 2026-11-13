// What a session's end does to its quest (implementation-plan §2.5, §3.7): the runner's RunResult becomes one move
// of the table, the character's matching move, and for a verifier the verdict, the assignee's reputation and level.
// An end that arrives for a quest that moved on meanwhile (cancelled, reassigned) changes nothing.
import { currentRun, protectedMarkOf } from '@elvaria/domain';
import { plotCommitMessage } from '@elvaria/runner-core';
import type { CharacterId, Quest, Result } from '@elvaria/domain';
import type { RunResult } from '@elvaria/runner-core';

import { fileMemos } from '../memos/file.ts';
import { moveAndRing } from '../notices.ts';
import { step } from '../record.ts';
import { judge, runOf, stallWithoutVerdict, verifierLeaves } from '../review/judge.ts';
import { afterJudge } from '../review/after-judge.ts';
import { breakAssignee, breakVerifier } from './breaker.ts';
import { commitPlot, warnUncommitted } from './commit.ts';
import { checksLetterAfter, noteUnchangedLetter } from './letter.ts';
import { outOfScopeIn } from './out-of-scope.ts';
import { applyAssigneePatch } from './patch.ts';
import type { Context } from '../context.ts';
import type { Finished, Running } from './running.ts';

/** The CLI's own limits are breakers (§3.4): max_turns trips `turns`, an exhausted budget trips `tokens`. */
const TRIPS = { max_turns: 'turns', budget: 'tokens' } as const;

/** The session has ended already: the breaker's `end` is the result it reported. */
const ended = (result: RunResult) => () => Promise.resolve(result);

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

async function settleAssignee(
  ctx: Context,
  running: Running,
  result: RunResult,
): Promise<Result<Quest, string>> {
  const who = running.character;
  const run = runOf(running, result);
  const quest = running.quest;
  if (result.rate_limited) {
    // The pause keeps the work on the branch too (§3.3: a WIP commit before a pause); a refusal leaves it in place.
    warnUncommitted(ctx, quest, await commitPlot(ctx, quest, plotCommitMessage.wip(quest, 'mana')));
    return moveAndRing(ctx, {
      quest,
      event: { type: 'mana_out', ...run },
      actor: 'mana',
      edits: { [who]: step('mana_out') },
    });
  }
  if (result.outcome === 'max_turns' || result.outcome === 'budget')
    return breakAssignee(ctx, running, { trip: TRIPS[result.outcome] }, ended(result));
  // The memos of the letter are filed when the run ends through a crash, a question or a submit; a run a breaker
  // cut (above, and the commit's trips in submitWork) wrote its letter in haste, and the next letter brings them (PS-02).
  if (result.outcome !== 'completed') {
    await fileMemos(ctx, running);
    return moveAndRing(ctx, {
      quest,
      event: { type: 'crash', ...run },
      actor: 'steward',
      edits: { [who]: step('crash') },
    });
  }
  if (result.question !== undefined) {
    await fileMemos(ctx, running);
    return moveAndRing(ctx, {
      quest,
      event: { type: 'ask', question: result.question, ...run },
      actor: 'runner',
      edits: { [who]: step('ask') },
    });
  }
  return submitWork(ctx, running, result);
}

/**
 * A run that completed without a question: the patch, the commit, the letter's memos, then the submit, whose line
 * names the files the work changed outside the quest's scope (PS-05). Work that changed a protected path sets the
 * royal seal and the mark that asks for the stronger judge on the quest, before the submit (PS-04, ADR 0026).
 */
async function submitWork(ctx: Context, running: Running, result: RunResult): Promise<Result<Quest, string>> {
  const who = running.character;
  const run = runOf(running, result);
  const quest = running.quest;
  await letLetterThrough(ctx, running, run.session_id);
  // What the CLI would not let the assignee write goes in first, as its patch, so the submit carries it (P1-28).
  // A patch that touches other paths or does not apply leaves everything in the plot, and the quest no review.
  const patched = await applyAssigneePatch(ctx, running);
  if (patched.status === 'refused')
    return breakAssignee(ctx, running, { trip: 'commit', patch: patched.detail }, ended(result));
  // Five classes have no git of their own, and the judge reads the branch's diff (§3.3, P1-07).
  const committed = await commitPlot(ctx, quest, plotCommitMessage.submit(quest));
  // A forbidden path changed, which only a program the session's shell ran could do: nothing is committed, and the
  // owner looks at the plot before anything else does (P1-49).
  if (committed.status === 'forbidden')
    return breakAssignee(ctx, running, { trip: 'forbidden_paths', paths: committed.paths }, ended(result));
  // The branch would lack the work: the quest goes to the infirmary with the hook's last words, not to review.
  if (committed.status === 'refused')
    return breakAssignee(ctx, running, { trip: 'commit', refused: committed }, ended(result));
  await fileMemos(ctx, running);
  const submitted = ctx.world.quests.get(quest);
  const mark =
    submitted === undefined ? undefined : protectedMarkOf(submitted, committed.protected_changes ?? []);
  return moveAndRing(ctx, {
    quest,
    event: { type: 'submit', ...run },
    actor: 'runner',
    edits: { [who]: step('submit') },
    ...(mark === undefined ? {} : { before: mark }),
    ...(submitted === undefined ? {} : { out_of_scope: await outOfScopeIn(ctx, submitted) }),
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
  // The CLI's own limits stop a verifier as the breakers do, and count toward the infirmary the same way (P1-23).
  if (result.outcome === 'max_turns' || result.outcome === 'budget')
    return breakVerifier(ctx, running, { trip: TRIPS[result.outcome] }, ended(result));
  const exit = result.exit_code === null ? '' : `, exit code ${String(result.exit_code)}`;
  return verifierLeaves(ctx, running, result, `the verifier's session ended ${result.outcome}${exit}`);
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
  if (quest !== undefined) {
    const settled =
      running.role === 'assignee'
        ? await settleAssignee(ctx, running, result)
        : await settleVerifier(ctx, quest, running, result);
    if (!settled.ok)
      ctx.deps.log.warn(
        `steward: ${running.quest}: the end of ${running.character}'s session: ${settled.error}`,
      );
  }
  // Whatever its end, what a judge broke on purpose in its scratch plot is never kept (ADR 0022, P1-20), nor what
  // its commands changed in the quest's own plot (P1-44).
  if (running.role === 'verifier') await afterJudge(ctx, running.quest, running.session_id);
}

/** Who holds the session the files say runs on `quest` while this Steward holds none there; undefined otherwise. */
function lostHolderOf(ctx: Context, quest: Quest): CharacterId | undefined {
  if (ctx.sessions.get(quest.id) !== undefined || quest.tier !== 'session') return undefined;
  const holder =
    quest.status === 'working' ? quest.assignee : quest.status === 'review' ? quest.verifier : null;
  return typeof holder === 'string' ? holder : undefined;
}

/** The end could not be recorded: the run ends as a crash, and a judge lost so counts toward a stalled review. */
async function crashed(ctx: Context, quest: Quest, holder: CharacterId): Promise<Result<Quest, string>> {
  const holds = ctx.world.characters.get(holder)?.current?.quest === quest.id;
  const edit = step(quest.status === 'working' ? 'crash' : 'unassign');
  const left = await moveAndRing(ctx, {
    quest: quest.id,
    event: { type: 'crash' },
    actor: 'steward',
    edits: holds ? { [holder]: edit } : {},
  });
  // A judge lost so left no verdict either: it counts toward a stalled review like any other (P1-33).
  return quest.status === 'review' ? stallWithoutVerdict(ctx, left, "the verifier's session was lost") : left;
}

/** The last Steward stopped or was killed under the session: the run says nothing and counts for nothing (P1-44). */
function released(ctx: Context, quest: Quest, holder: CharacterId): Promise<Result<Quest, string>> {
  const holds = ctx.world.characters.get(holder)?.current?.quest === quest.id;
  return ctx.record.move({
    quest: quest.id,
    event: { type: 'release' },
    actor: 'steward',
    edits: holds ? { [holder]: step('unassign') } : {},
  });
}

/**
 * A quest the files say runs a session this Steward does not hold. No quest ever runs two sessions (§3.1), so the
 * run ends. At start (`restarted`), the last Steward stopped or was killed under it: the session went with that
 * Steward, not through any fault of its holder, so the assignee goes on in a fresh session with its attempt given
 * back (§2.5 `working.release.by_character`) and a judge leaves without counting toward a stalled review
 * (`review.release.has_verifier`); in the P1-37 run two kills of the Steward cost a quest two attempts (P1-44).
 * Later, the end could not be recorded: the run ends as a crash, the assignee tries again in a fresh session, a
 * verifier leaves the review to the next one. A judge's plot is put back after it either way (afterJudge).
 */
export async function reapLost(ctx: Context, restarted = false): Promise<void> {
  for (const quest of [...ctx.world.quests.values()]) {
    const holder = lostHolderOf(ctx, quest);
    if (holder === undefined) continue;
    const moved = restarted ? await released(ctx, quest, holder) : await crashed(ctx, quest, holder);
    if (!moved.ok) {
      ctx.deps.log.warn(`steward: ${quest.id}: a lost session: ${moved.error}`);
      continue;
    }
    ctx.deps.log.warn(
      restarted
        ? `steward: ${quest.id}: ${holder}'s session was lost with the last Steward; the run does not count`
        : `steward: ${quest.id}: ${holder}'s session was lost; the run ended as a crash`,
    );
    if (quest.status === 'review') await afterJudge(ctx, quest.id);
  }
}
