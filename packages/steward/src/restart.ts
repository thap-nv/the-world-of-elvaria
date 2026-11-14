// What a Steward finishes at start that the last one left half done (implementation-plan §3.1 "Khởi động lại",
// P1-44, P1-42 (a)). A review stalls in two moves: the judge that fills the group leaves (§2.5 `review.crash`,
// `review.breaker`, `review.verdict_partial` with a verifier), then the Steward sends the quest to the infirmary (the
// same rows without one). A Steward stopped between the two left a review that planTick would give a new judge, whose
// group would count as after the owner's retry: the move is made now, before the first plan. Right after the owner's
// retry the quest looks the same in its file (the full group still stands, P1-26), so the log tells them apart: there
// the last move of the quest is the retry, or the infirmary the retry left when its own line was lost.
import { infirmaryReasonOf, reviewStallOf } from '@elvaria/domain';
import type { Event, Quest, QuestId, ReviewStall } from '@elvaria/domain';

import { moveAndRing } from './notices.ts';
import type { Context } from './context.ts';
import type { InfirmaryCause } from './infirmary.ts';
import type { MovePayload } from './record.ts';

/** What the first tick of a Steward finishes. */
export interface Restart {
  /**
   * Quests whose last move in the log is the owner's retry, or the infirmary it brought them out of: a stalled
   * review among them waits for its new judge, not for the infirmary.
   */
  readonly retried: ReadonlySet<QuestId>;
}

/** Quest lines that move nothing: the owner's edit, the Steward's notice about an open quest. */
const NOT_MOVES: ReadonlySet<string> = new Set(['quest.edited', 'quest.unclaimable']);

/** The retry of a stalled review is the owner's `quest.submitted` (questLogTypeOf); a submit is a character's. */
const retriedBy = (event: Event): boolean =>
  event.type === 'quest.infirmary' || (event.type === 'quest.submitted' && event.actor.kind === 'user');

export function restartFromLog(events: readonly Event[]): Restart {
  const last = new Map<QuestId, Event>();
  for (const event of events) {
    if (event.quest === undefined || !event.type.startsWith('quest.') || NOT_MOVES.has(event.type)) continue;
    last.set(event.quest, event);
  }
  return { retried: new Set([...last].filter(([, event]) => retriedBy(event)).map(([quest]) => quest)) };
}

/** The second move of a stall, as the Steward would have made it right after the judge's end. */
function stallMoveOf(stall: ReviewStall): {
  readonly event: MovePayload;
  readonly infirmary: InfirmaryCause;
} {
  if (stall.by === 'partial')
    return {
      event: { type: 'verdict_partial' },
      infirmary: {
        trip: 'partial_verdicts',
        reason: infirmaryReasonOf('restart:partial_verdicts', { count: stall.count }),
        detail: { partial_verdicts: stall.count },
      },
    };
  const detail = { verifiers_stopped: stall.count };
  // A judge whose session never opened left as one that crashed (§2.5 `review.no_session`, fix/review-no-session).
  if (stall.by === 'crash' || stall.by === 'no_session')
    return {
      event: { type: 'crash' },
      infirmary: {
        trip: 'no_verdict',
        reason: infirmaryReasonOf('restart:no_verdict', { stopped: stall.count }),
        detail,
      },
    };
  // attempt_log tells time from the rest, not tokens from turns; the CLI's own turn limit is the rare one.
  const trip = stall.by === 'timeout' ? 'time' : 'tokens';
  return {
    event: { type: 'breaker', trip },
    infirmary: { trip, reason: infirmaryReasonOf(`restart:${trip}`, { stopped: stall.count }), detail },
  };
}

const waitsForJudge = (quest: Quest): boolean =>
  quest.status === 'review' && quest.tier === 'session' && quest.verifier === null;

/** Sends to the infirmary every review the last Steward left stalled without the move there (P1-42 (a)). */
export async function stallLeftReviews(ctx: Context, restart: Restart): Promise<void> {
  for (const quest of [...ctx.world.quests.values()]) {
    if (!waitsForJudge(quest) || restart.retried.has(quest.id)) continue;
    const stall = reviewStallOf(quest);
    if (stall === undefined) continue;
    const moved = await moveAndRing(ctx, { quest: quest.id, actor: 'steward', ...stallMoveOf(stall) });
    if (!moved.ok) ctx.deps.log.warn(`steward: ${quest.id}: a stalled review stays: ${moved.error}`);
    else ctx.deps.log.warn(`steward: ${quest.id}: its review stalled before the last Steward stopped`);
  }
}
