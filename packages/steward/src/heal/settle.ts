// What a healer's session's end does to its quest (ADR 0034, plans/healer.md 4.4–4.5): the machine measures the heal
// and judges it, not the healer. Mana out: the heal does not count, the plot goes back on the doer's work and the next
// tick chooses again (`healing.mana_out`). A cut, a crash, a heal the Steward refuses (nothing changed, a file outside
// the doer's staged work, past kingdom.heal's limits) or a second refusal of the hooks: the infirmary, with the bell
// and the healer's note. Else heal.patch is kept and the Steward commits through the hooks; the submit goes to review
// with what the healer changed on its line, and the doer stays the quest's assignee.
import { infirmaryReasonOf } from '@elvaria/domain';
import { plotCommitMessage } from '@elvaria/runner-core';
import type { BreakerTrip, InfirmaryDetail, InfirmaryReason, Quest, Result } from '@elvaria/domain';
import type { HealDiff, RunResult } from '@elvaria/runner-core';

import { moveAndRing } from '../bell/move-and-ring.ts';
import { step } from '../quest/record.ts';
import { runOf } from '../review/judge.ts';
import { refusalReasonOf } from '../sessions/breaker.ts';
import { commitPlot } from '../sessions/commit.ts';
import { givenTo } from '../sessions/secrets.ts';
import { submitMarksOf } from '../sessions/submit.ts';
import { healNoteOf } from './note.ts';
import { keepHealPatch } from './patch.ts';
import { openedTreeOf, putBack } from './tree.ts';
import type { Context } from '../context.ts';
import type { CharacterEdit } from '../quest/record.ts';
import type { Running } from '../sessions/running.ts';

/** The CLI's own limits are breakers (§3.4): max_turns trips `turns`, an exhausted budget trips `tokens`. */
const TRIPS = { max_turns: 'turns', budget: 'tokens' } as const;

/** Two character moves in one: the healer's own end, then letting go of a quest it no longer holds. */
const andThen =
  (first: CharacterEdit, second: CharacterEdit): CharacterEdit =>
  (character, at) => {
    const once = first(character, at);
    return once.ok ? second(once.value, at) : once;
  };

/**
 * Why the heal ends in the infirmary: the trip of its breaker row, or a crash (`healing.crash`, told as trip
 * `no_session`: the session failed), with the reason and its detail.
 */
interface HealEnd {
  readonly trip: BreakerTrip;
  readonly crash?: true;
  readonly reason: InfirmaryReason;
  readonly detail?: InfirmaryDetail;
  /** The plot goes back on the doer's work: what the healer changed is refused (not after the hooks refused it). */
  readonly putBack: boolean;
}

/**
 * The heal ends in the infirmary (§2.5 `healing.breaker`, `healing.crash`): the bell rings with the reason and the
 * healer's note from the letter; the healer is idle again. No `reason` on the breaker event: a heal has no heal.
 */
export async function healFails(
  ctx: Context,
  quest: Quest,
  running: Running,
  result: RunResult,
  end: HealEnd,
): Promise<Result<Quest, string>> {
  if (end.putBack) await putBack(ctx, quest);
  const run = runOf(running, result);
  const who = running.character;
  const crash = end.crash === true;
  const note = await healNoteOf(ctx, quest, who);
  return moveAndRing(ctx, {
    quest: quest.id,
    event: crash ? { type: 'crash', ...run } : { type: 'breaker', trip: end.trip, ...run },
    actor: 'steward',
    edits: { [who]: crash ? step('crash') : andThen(step('breaker'), step('quest_infirmary')) },
    infirmary: {
      trip: end.trip,
      reason: end.reason,
      ...(end.detail === undefined ? {} : { detail: end.detail }),
      ...note,
    },
  });
}

/** The Steward's call on what the healer changed (plans/healer.md 4.4): undefined when the heal may be committed. */
function refusalOf(ctx: Context, diff: HealDiff): HealEnd | undefined {
  const { max_files: maxFiles, max_lines: maxLines } = ctx.world.kingdom.heal;
  if (diff.files.length === 0)
    return { trip: 'commit', reason: infirmaryReasonOf('heal:unchanged'), putBack: true };
  if (diff.outside.length > 0)
    return {
      trip: 'commit',
      reason: infirmaryReasonOf('heal:out_of_work', { count: diff.outside.length }),
      detail: { paths: [...diff.outside] },
      putBack: true,
    };
  if (diff.files.length > maxFiles || diff.lines > maxLines)
    return {
      trip: 'commit',
      reason: infirmaryReasonOf('heal:over_limit', { files: diff.files.length, lines: diff.lines }),
      putBack: true,
    };
  return undefined;
}

/** What the healer changed since the tree its session opened on; throws when it cannot be measured. */
async function measured(ctx: Context, quest: Quest): Promise<HealDiff> {
  const tree = await openedTreeOf(ctx, quest);
  const plots = ctx.deps.plots;
  const diff =
    tree === undefined || plots.healDiff === undefined ? null : await plots.healDiff(quest.plot, tree);
  if (diff === null) throw new Error('no staged tree to measure the heal against');
  return diff;
}

/** A completed session: measured, kept as heal.patch, judged by the Steward, then committed through the hooks. */
async function mended(
  ctx: Context,
  quest: Quest,
  running: Running,
  result: RunResult,
): Promise<Result<Quest, string>> {
  const diff = await measured(ctx, quest);
  const patch =
    diff.patch === '' ? undefined : await keepHealPatch(ctx, quest, diff.patch, givenTo(running.session));
  const refused = refusalOf(ctx, diff);
  if (refused !== undefined || patch === undefined)
    return healFails(
      ctx,
      quest,
      running,
      result,
      refused ?? { trip: 'commit', reason: infirmaryReasonOf('heal:unchanged'), putBack: true },
    );
  const committed = await commitPlot(ctx, quest.id, plotCommitMessage.submit(quest.id));
  if (committed.status === 'forbidden')
    return healFails(ctx, quest, running, result, {
      trip: 'forbidden_paths',
      reason: infirmaryReasonOf('breaker:forbidden_paths', { count: committed.paths.length }),
      detail: { paths: [...committed.paths] },
      putBack: true,
    });
  // The hooks refused the heal too: the infirmary, its log beside the first one; the plot keeps the heal (wip.patch).
  if (committed.status === 'refused')
    return healFails(ctx, quest, running, result, {
      trip: 'commit',
      reason: refusalReasonOf(quest, committed),
      putBack: false,
    });
  const { before, ...line } = await submitMarksOf(ctx, quest.id, committed);
  return moveAndRing(ctx, {
    quest: quest.id,
    event: { type: 'submit', ...runOf(running, result) },
    actor: 'steward',
    edits: { [running.character]: step('submit') },
    before,
    ...line,
    heal: { by: running.character, files: diff.files.length, lines: diff.lines, patch },
  });
}

/** The end of a healer's session on its `healing` quest (settle.ts routes it here). */
export async function settleHealer(
  ctx: Context,
  quest: Quest,
  running: Running,
  result: RunResult,
): Promise<Result<Quest, string>> {
  if (result.rate_limited) {
    await putBack(ctx, quest);
    return moveAndRing(ctx, {
      quest: quest.id,
      event: { type: 'mana_out', ...runOf(running, result) },
      actor: 'mana',
      // The healer sleeps holding nothing: the next tick chooses again, maybe another (HL-04 (c)).
      edits: { [running.character]: andThen(step('mana_out'), step('unassign')) },
    });
  }
  if (result.outcome === 'max_turns' || result.outcome === 'budget')
    return healFails(ctx, quest, running, result, healCut(TRIPS[result.outcome]));
  if (result.outcome !== 'completed')
    return healFails(ctx, quest, running, result, sessionEnded(result.outcome));
  try {
    return await mended(ctx, quest, running, result);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    ctx.deps.log.warn(`steward: ${quest.id}: ${running.character}'s heal could not be measured: ${why}`);
    return healFails(ctx, quest, running, result, sessionEnded(`unmeasured: ${why}`));
  }
}

/** A ceiling or the CLI's own limit cut the heal: no session goes on from it (plans/healer.md 4.4). */
export const healCut = (trip: BreakerTrip): HealEnd => ({
  trip,
  reason: infirmaryReasonOf('heal:cut', { trip }),
  putBack: true,
});

const sessionEnded = (outcome: string): HealEnd => ({
  trip: 'no_session',
  crash: true,
  reason: infirmaryReasonOf('heal:session_ended', { outcome }),
  putBack: true,
});
