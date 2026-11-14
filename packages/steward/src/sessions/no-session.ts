// A session that could not open (fix/review-no-session): the plot, the request or the spawn threw (its CLI is gone,
// the prompt is longer than the CLI takes, the plot could not be made). Before, the Steward wrote a warning and
// nothing else, so the next tick planned the same move: on PS-07's kingdom an agy judge whose prompt was longer than
// Windows takes was chosen every 5 s for 16 minutes, and the digest said nothing. Now the move says what happened, as
// the state machine has it (§2.5): a judge leaves the review as one whose session crashed, an assignee's quest goes
// to the infirmary with the reason and the bell.
import { err } from '@elvaria/domain';
import type { CharacterId, Quest, Result } from '@elvaria/domain';

import { moveAndRing } from '../notices.ts';
import { stallWithoutVerdict } from '../review/judge.ts';
import { releaseScratch } from '../review/scratch.ts';
import { cannotOpen } from './breaker.ts';
import type { Context } from '../context.ts';

/** At most this many characters of the error in the reason; the Steward's log keeps it whole. */
const ERROR_LINE_MAX = 300;

/** What the owner reads: who could not open a session, and the first line of why. */
export function unopenedWhy(character: CharacterId, error: string): string {
  const line = error.trim().split(/\r?\n/u)[0]?.trim().slice(0, ERROR_LINE_MAX) ?? '';
  return `${character}'s session could not open${line === '' ? '' : `: ${line}`}`;
}

/** How the assignee's session was to open (open.ts `Opening`). */
type OpeningKind = 'start' | 'redispatch' | 'answer' | 'wake';

/**
 * The assignee's session did not open. While the Steward stops, its plot's setup was cut short (P1-49): a start
 * lets the claim go, as before, and nothing else moves. The owner's answer is refused, the quest still blocked, as
 * for missing secrets. Otherwise the quest goes to the infirmary with the reason (§2.5 `breaker`, trip
 * `no_session`): the claim, the redispatch or the wake would fail the same way every tick.
 */
export async function assigneeUnopened(
  ctx: Context,
  quest: Quest,
  opening: OpeningKind,
  why: string,
): Promise<Result<Quest, string>> {
  if (opening === 'answer') return err('spawn_failed');
  if (ctx.stopping.aborted) {
    if (opening === 'start')
      await ctx.record.move({ quest: quest.id, event: { type: 'release' }, actor: 'steward' });
    return err('spawn_failed');
  }
  return cannotOpen(ctx, quest, 'no_session', why);
}

/**
 * The judge's session did not open: it leaves the review as a judge whose session crashed (§2.5
 * `review.no_session`), passed over while another judge may take the review, and the REVIEW_BREAKS_MAX-th judge to
 * leave so sends the quest to the infirmary with the bell (stallWithoutVerdict). A scratch plot made for it goes, and
 * the exclusive lock it held; the quest's own plot is not put back, since no command ran there. While the Steward
 * stops, nothing moves: the stop cut the setup short, not the judge.
 */
export async function judgeUnopened(
  ctx: Context,
  quest: Quest,
  judge: CharacterId,
  why: string,
): Promise<Result<Quest, string>> {
  if (ctx.stopping.aborted) return err('spawn_failed');
  await releaseScratch(ctx, quest.id);
  const left = await moveAndRing(ctx, {
    quest: quest.id,
    event: { type: 'no_session', verifier: judge },
    actor: 'steward',
  });
  return stallWithoutVerdict(ctx, left, why);
}
