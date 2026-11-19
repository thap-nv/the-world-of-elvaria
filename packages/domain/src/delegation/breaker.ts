// The breaker of the seal delegation (implementation-plan §3.16.7, ADR 0023; PS-08g, K11): one defect that escaped with
// a quest the delegation merged without the seal suspends the delegation of its territory until the owner resumes it.
// The suspension lives in the log alone, two lines a territory (K9 (1)): sealSuspendedOf folds them, and the Steward
// rebuilds it at start (`recover`) for the three places PS-08b left for it (SealPolicy.suspended); sealPolicyOf joins
// it to kingdom.delegation.seal, for the Steward and `elvaria digest` alike (fix/run-221-followups). The signals are
// pure here and the Steward writes their line: a check of the default branch that turned red with a merge without the
// seal among its suspects, at the patrol that found it (baseRedSuspension), and the owner's report of a defect that
// escaped with such a quest (escapeSuspension). A red check of the forge comes with PS-08f.
import { isEventOf } from '../schema/event/event.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { RedCheck } from '../patrol/health.ts';
import type { EventData } from '../schema/event/event-data.ts';
import type { Event } from '../schema/event/event.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { SealPolicy } from './seal.ts';

/** What a `delegation.suspended` line says: the territory, the quest the signal blames, why. */
export type SuspensionData = EventData<'delegation.suspended'>;

/** A territory whose delegation is suspended: the line that suspended it, and when it was written. */
export interface SealSuspension extends SuspensionData {
  readonly since: string;
}

type Suspended = readonly Pick<SealSuspension, 'territory'>[];

/**
 * The territories whose delegation is suspended, by id: each with its latest `delegation.suspended` that no
 * `delegation.resumed` followed. A second suspension before a resume (the Steward writes none) keeps the first.
 */
export function sealSuspendedOf(events: readonly Event[]): SealSuspension[] {
  const suspended = new Map<TerritoryId, SealSuspension>();
  for (const event of events) {
    if (isEventOf(event, 'delegation.resumed')) suspended.delete(event.data.territory);
    else if (isEventOf(event, 'delegation.suspended') && !suspended.has(event.data.territory))
      suspended.set(event.data.territory, { ...event.data, since: event.ts });
  }
  return [...suspended.values()].toSorted((a, b) => a.territory.localeCompare(b.territory));
}

/** The territories of `suspensions`, for SealPolicy.suspended. */
export const suspendedTerritoriesOf = (suspensions: Suspended): TerritoryId[] =>
  suspensions.map(({ territory }) => territory);

/**
 * The delegation of the seal as the kingdom stands: kingdom.delegation.seal, and the territories the breaker suspended.
 * The Steward passes the suspensions its book holds, `elvaria digest` those the log folds to (sealSuspendedOf), so both
 * digests spare the same pull requests (fix/run-221-followups: the printed one named them all for the owner).
 */
export const sealPolicyOf = (kingdom: Pick<Kingdom, 'delegation'>, suspensions: Suspended): SealPolicy => ({
  seal: kingdom.delegation.seal,
  suspended: suspendedTerritoriesOf(suspensions),
});

const suspendedOn = (territory: TerritoryId, suspensions: Suspended): boolean =>
  suspensions.some((suspension) => suspension.territory === territory);

/**
 * Signal (1): of the checks the patrol of `territory` found turned red (stepPatrol's `turned_red`), the first with a
 * merge without the seal among its suspects suspends the delegation, blaming the oldest such merge. None while the
 * territory's delegation is suspended already (one line per suspension), nor when every suspect had the seal.
 */
export function baseRedSuspension(
  territory: TerritoryId,
  turned: readonly RedCheck[],
  suspensions: Suspended,
): SuspensionData | undefined {
  if (suspendedOn(territory, suspensions)) return undefined;
  for (const red of turned) {
    const blamed = red.suspects.find(({ sealed }) => !sealed);
    if (blamed !== undefined) return { territory, quest: blamed.quest, cause: 'base_red', check: red.check };
  }
  return undefined;
}

/**
 * Signal (2): the owner's report of a defect that escaped with a quest the delegation merged without the seal suspends
 * the delegation of its territory; one on any other quest only counts in the metrics. None while it is suspended.
 */
export function escapeSuspension(
  escape: EventData<'quest.escaped'>,
  suspensions: Suspended,
): SuspensionData | undefined {
  if (!escape.delegated || suspendedOn(escape.territory, suspensions)) return undefined;
  const note = escape.note === undefined ? {} : { note: escape.note };
  return { territory: escape.territory, quest: escape.quest, cause: 'escape_reported', ...note };
}
