// Why a quest goes to the infirmary (implementation-plan §3.4, P1-32). The Steward names the cause once, a trip and its
// detail, and builds from it both the structured data of the `quest.infirmary` line and the one English line
// (`reason`) the bell and the chronicle say, so the two never disagree. The next run's prompt reads a refused patch
// back from that data (P1-31); a line written before P1-32 has the reason alone, whose prefix is still read.
import { PATCH_FILE } from '@elvaria/runner-core';
import type { EventData, InfirmaryDetail, InfirmaryTrip } from '@elvaria/domain';

export interface InfirmaryCause {
  readonly trip: InfirmaryTrip;
  readonly detail?: InfirmaryDetail;
}

type InfirmaryWhy = Pick<EventData<'quest.infirmary'>, 'reason' | 'trip' | 'detail'>;

/** What a line written since P1-32 says of why: always a trip. */
interface InfirmarySaid {
  readonly reason: string;
  readonly trip: InfirmaryTrip;
  readonly detail?: InfirmaryDetail;
}

/** A crash or a fail at max_attempts: the trip says it all. */
export const OUT_OF_ATTEMPTS: InfirmaryCause = { trip: 'max_attempts' };

/** The owner's part of an apprentice cut short (§3.12 invariant 3), as the reason says it. */
export const APPRENTICE_LEFT =
  '; an apprentice of this session ran past its minutes or was cut at its turns: open a child quest for the work it left (see handover.md)';

const patchRefusal = (why: string): string => `${PATCH_FILE} was not applied: ${why}`;

const SCRIPT_TRIP = 'script_';

/** A review whose judges left with no verdict at all (P1-33): `review:no_verdict`, not a breaker. */
const NO_VERDICT_HEAD = 'review:no_verdict';

/** `breaker:<trip>`, `script:<outcome>` or `review:no_verdict`. */
function headOf(trip: InfirmaryTrip): string {
  if (trip.startsWith(SCRIPT_TRIP)) return `script:${trip.slice(SCRIPT_TRIP.length)}`;
  return trip === 'no_verdict' ? NO_VERDICT_HEAD : `breaker:${trip}`;
}

/**
 * A stalled review (P1-23, P1-33): how many judges of the run left without a verdict, and what the owner can do: a
 * budget too small for the review stops every judge, a judge that hands in no verdict needs another judge.
 */
function stalledReview(trip: InfirmaryTrip, stopped: number, run: number): string {
  const remedy =
    trip === 'no_verdict'
      ? 'see why in the log, and give the review a judge that hands in a verdict before a retry'
      : 'raise the budget (quest edit) before a retry';
  return `; ${stopped} verifiers of run ${run} left without a verdict, so no further one opens: ${remedy}`;
}

/** The head, then what was said, the WIP left in the plot, the apprentice, the review. */
function stopReason(trip: InfirmaryTrip, detail: InfirmaryDetail, run: number): string {
  const words = detail.patch === undefined ? detail.message : patchRefusal(detail.patch);
  const wip = detail.wip === undefined ? '' : ` (WIP not committed, it stays in the plot: ${detail.wip})`;
  const left = detail.apprentice_left === true ? APPRENTICE_LEFT : '';
  const stopped = detail.verifiers_stopped;
  const stalled = stopped === undefined ? '' : stalledReview(trip, stopped, run);
  return `${headOf(trip)}${words === undefined ? '' : `: ${words}`}${wip}${left}${stalled}`;
}

/** The detail without empty words: a hook or a script that printed nothing said nothing (the schema refuses ''). */
const spoken = (detail: InfirmaryDetail = {}): InfirmaryDetail =>
  Object.fromEntries(Object.entries(detail).filter(([, value]) => value !== ''));

/** The reason in one English line, as the Steward wrote it before P1-32; `run` is the run the quest stopped in. */
export function infirmaryReason(cause: InfirmaryCause, run: number): string {
  const { trip } = cause;
  const detail = spoken(cause.detail);
  if (trip === 'max_attempts') return trip;
  if (trip !== 'script_fail') return stopReason(trip, detail, run);
  const opened = detail.follow_up === undefined ? '' : `; follow-up quest ${detail.follow_up} opened`;
  return `script:fail: ${detail.script ?? 'the script'} did not pass, see the verdict${opened}`;
}

/**
 * What a `quest.infirmary` line, and the bell, say beside the quest: the reason, the trip, the detail when it has
 * any.
 */
export function infirmaryData(cause: InfirmaryCause, run: number): InfirmarySaid {
  const detail = spoken(cause.detail);
  return {
    reason: infirmaryReason(cause, run),
    trip: cause.trip,
    ...(Object.keys(detail).length === 0 ? {} : { detail }),
  };
}

/** The start of a refused patch's reason on a line written before P1-32. */
const REFUSED = `breaker:commit: ${patchRefusal('')}`;

/**
 * Why the Steward refused a patch, read back from a `quest.infirmary` line; undefined for any other cause. A line
 * written before P1-32 has no trip: its reason is read by prefix, without the note about an apprentice's work left.
 */
export function refusedPatchOf(line: InfirmaryWhy): string | undefined {
  if (line.trip !== undefined) return line.detail?.patch;
  if (!line.reason.startsWith(REFUSED)) return undefined;
  const why = line.reason.slice(REFUSED.length);
  return why.endsWith(APPRENTICE_LEFT) ? why.slice(0, -APPRENTICE_LEFT.length) : why;
}
