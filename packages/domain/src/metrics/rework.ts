// Rework (implementation-plan §3.16.1, ADR 0027): every counted session beyond one assignee and one verifier per
// quest. Each is given the cause that made it necessary, read from the files alone: a second session of the same
// role in the same run follows from how the previous one ended (a question, a breaker, a crash); the first session
// of a later run follows from how the run before ended (a fail verdict by its kind, or the breaker or crash that
// stopped it). The verifier of a redone run shares its assignee's cause: one fail verdict costs two sessions.
import { FAIL_KIND_CAUSES, OUTCOME_CAUSES, TRIP_CAUSES } from './causes.ts';
import type { ReworkCause } from './causes.ts';
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { InfirmaryTrip } from '../quest/events.ts';
import type { Role } from '../schema/common.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

/** A `quest.infirmary` line that names its trip (since P1-32; older lines have the reason text alone). */
export interface TripAt {
  readonly at: string;
  readonly trip: InfirmaryTrip;
}

/** One quest and what the metrics read beside it. */
export interface QuestTrail {
  readonly quest: Quest;
  /** This quest's verdicts, partial ones included. */
  readonly verdicts: readonly Verdict[];
  /** This quest's infirmary trips, in the order they were written. */
  readonly trips: readonly TripAt[];
}

export const REASON_SOURCES = ['outcome', 'fail_kind', 'trip', 'none'] as const;
export type ReasonSource = (typeof REASON_SOURCES)[number];

/** The cause and what gave it: an attempt outcome, a verdict's fail kind, an infirmary trip, or nothing. */
export interface ReworkReason {
  readonly cause: ReworkCause;
  readonly by: ReasonSource;
  readonly value: string | null;
}

export interface Rework extends ReworkReason {
  readonly quest: QuestId;
  readonly n: number;
  readonly role: Role;
  readonly character: CharacterId;
  readonly started_at: string;
}

type CountedAttempt = Attempt & { readonly character: CharacterId };

const UNEXPLAINED: ReworkReason = { cause: 'unknown', by: 'none', value: null };

/**
 * A session the metrics count: a character's (a script or the machine's merge has none) that the mana did not stop.
 * A run the mana paused goes on in the next session of the same attempt, which is not a redo.
 */
export const isCounted = (entry: Attempt): entry is CountedAttempt =>
  entry.character !== null && entry.outcome !== 'paused';

const timeOf = (timestamp: string): number => Date.parse(timestamp);

/** The latest fail verdict on run `n`: the owner's return wins over the judge's pass it overturned. */
export const lastFailOf = (verdicts: readonly Verdict[], n: number): Verdict | undefined =>
  verdicts
    .filter((verdict) => verdict.attempt === n && verdict.result === 'fail')
    .sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at))
    .at(-1);

/** What the end of `entry` says about a session that started at `until`. */
function endingOf(trail: QuestTrail, entry: CountedAttempt, until: string): ReworkReason {
  const outcome = entry.outcome ?? 'submitted';
  const byOutcome = OUTCOME_CAUSES[outcome];
  if (byOutcome !== undefined) return { cause: byOutcome, by: 'outcome', value: outcome };
  const fail = lastFailOf(trail.verdicts, entry.n);
  if (fail !== undefined) {
    // The schema wants a fail kind on every fail; a file without one reads as `other`.
    const kind = fail.fail_kind ?? 'other';
    return { cause: FAIL_KIND_CAUSES[kind], by: 'fail_kind', value: kind };
  }
  const from = timeOf(entry.started_at);
  const to = timeOf(until);
  const tripped = trail.trips
    .flatMap(({ at, trip }) => {
      const cause = TRIP_CAUSES[trip];
      return cause === undefined || timeOf(at) < from || timeOf(at) > to ? [] : [{ cause, trip }];
    })
    .at(-1);
  return tripped === undefined ? UNEXPLAINED : { cause: tripped.cause, by: 'trip', value: tripped.trip };
}

function reasonOf(trail: QuestTrail, before: readonly CountedAttempt[], entry: CountedAttempt): ReworkReason {
  const previous =
    before.findLast(({ role, n }) => role === entry.role && n === entry.n) ??
    before.findLast(({ n }) => n < entry.n);
  // Only a log whose runs go backwards has neither.
  return previous === undefined ? UNEXPLAINED : endingOf(trail, previous, entry.started_at);
}

/** Every rework session of the quest, in log order, with its cause. */
export function reworkOf(trail: QuestTrail): Rework[] {
  const counted = trail.quest.attempt_log.filter(isCounted);
  return counted.flatMap((entry, index) => {
    const before = counted.slice(0, index);
    if (!before.some(({ role }) => role === entry.role)) return [];
    const { n, role, character, started_at } = entry;
    return [{ quest: trail.quest.id, n, role, character, started_at, ...reasonOf(trail, before, entry) }];
  });
}
