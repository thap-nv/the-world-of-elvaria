// A character's session cut by a ceiling (time, tokens, turns): does the quest go on in a fresh session, or does it
// go to the infirmary? (ADR 0030, implementation-plan §3.4.) The decision reads the attempt_log of the current run
// and whether this cut made progress; the Steward only carries it out.
import { CAP_TRIPS } from '../quest/events.ts';
import type { BreakerTrip, CapTrip } from '../quest/events.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';

export type CutCall = 'go_on' | 'infirmary';

/** True for the three ceilings; every other trip keeps today's way and never goes on by itself. */
export const isCapTrip = (trip: BreakerTrip): trip is CapTrip =>
  (CAP_TRIPS as readonly string[]).includes(trip);

/**
 * The call for a cut of the assignee's open session, the last assignee entry of `log`. A cut with progress always
 * goes on, however many went on before it (no ceiling on continuations). One without goes on too, unless the session
 * right before it, in the same run, was cut without progress as well: two such cuts in a row, the infirmary. Only the
 * run counts: `retry` and `reassign` open run n + 1, so a cut after them starts a new chain. A heal session never
 * goes on (ADR 0034): its ceilings are its own and small, so a cut says the heal failed, and the owner looks.
 */
export function cutCallOf(log: readonly Attempt[], progress: boolean): CutCall {
  const mine = log.filter((entry) => entry.role === 'assignee');
  const open = mine.at(-1);
  if (open?.heal === 'session') return 'infirmary';
  if (progress) return 'go_on';
  const before = mine.slice(0, -1).at(-1);
  return open !== undefined && before?.n === open.n && before.progress === false ? 'infirmary' : 'go_on';
}

/**
 * Whether the quest's latest session was the assignee's and ended in a cut that went on: such a cut writes `progress`
 * on its entry. The next session then goes on in the same run, without a new attempt, as one that follows an answer
 * or mana coming back. A cut that stopped leads to the infirmary, and since fix/quest-hold the owner may send that work
 * to review (`infirmary.submit`): a judge's entry then comes after the cut, and the redispatch after its fail is a new
 * attempt, as after any fail. Reading the last assignee entry alone resumed the old run there, the budget untouched.
 */
export const endedInCut = (log: readonly Attempt[]): boolean => {
  const last = log.at(-1);
  return last?.role === 'assignee' && last.progress !== undefined;
};
