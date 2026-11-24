import { isEventOf } from '../../schema/event/event.ts';
import { checkPolicyOf } from '../../schema/territory-check-policy.ts';
import { inWindow } from '../window.ts';
import { ESCAPE_MERGES_MAX, ESCAPE_MERGES_MIN, ESCAPE_RATE_DENOMINATOR } from './constants.ts';
import type { TerritoryId } from '../../core/ids.ts';
import type { Event } from '../../schema/event/event.ts';
import type { Quest } from '../../schema/quest/quest.ts';
import type { Verdict } from '../../schema/quest/verdict.ts';
import type { Territory } from '../../schema/territory.ts';
import type { MetricsWindow } from '../window.ts';

export interface TerritoryEscapes {
  readonly territory: TerritoryId;
  merges: number;
  own_change: number;
  combination: number;
  late: number;
}

export interface NarrowEscapeAlert {
  readonly territory: TerritoryId;
  readonly merges: number;
  readonly escapes: number;
}

/** Count conclusions, not checks within a probe; late verdict files are a separate measure (CM-09b). */
export function checkEscapesOf(
  events: readonly Event[],
  window: MetricsWindow,
  quests: readonly Quest[],
  verdicts: readonly Verdict[],
): TerritoryEscapes[] {
  const rows = new Map<TerritoryId, TerritoryEscapes>();
  const rowOf = (territory: TerritoryId): TerritoryEscapes => {
    const row = rows.get(territory) ?? { territory, merges: 0, own_change: 0, combination: 0, late: 0 };
    rows.set(territory, row);
    return row;
  };
  for (const event of events) {
    if (!inWindow(window, event.ts)) continue;
    if (isEventOf(event, 'delivery.merged')) rowOf(event.data.territory).merges += 1;
    if (isEventOf(event, 'check.attributed')) {
      const row = rowOf(event.data.territory);
      if (event.data.cause === 'own_change' || event.data.cause === 'combination') row[event.data.cause] += 1;
    }
  }
  for (const verdict of verdicts) {
    if (verdict.late !== true || !inWindow(window, verdict.created_at)) continue;
    const quest = quests.find(({ id }) => id === verdict.quest_id);
    if (quest !== undefined) rowOf(quest.territory).late += 1;
  }
  return [...rows.values()].sort((a, b) => a.territory.localeCompare(b.territory));
}

/** The last twenty merge lines in log order, independent of the ledger's date window. */
export function narrowEscapeAlertsOf(
  events: readonly Event[],
  territories: readonly Territory[],
): NarrowEscapeAlert[] {
  return territories.flatMap((territory) => {
    if (checkPolicyOf(territory).mode !== 'narrow') return [];
    const merges = events
      .flatMap((event) =>
        isEventOf(event, 'delivery.merged') && event.data.territory === territory.id
          ? [event.data.quest]
          : [],
      )
      .slice(-ESCAPE_MERGES_MAX);
    if (merges.length < ESCAPE_MERGES_MIN) return [];
    const culprits = new Set(merges);
    const escapes = events.filter(
      (event) =>
        isEventOf(event, 'check.attributed') &&
        event.data.territory === territory.id &&
        (event.data.cause === 'own_change' || event.data.cause === 'combination') &&
        event.data.culprit !== undefined &&
        culprits.has(event.data.culprit),
    ).length;
    return escapes * ESCAPE_RATE_DENOMINATOR > merges.length
      ? [{ territory: territory.id, merges: merges.length, escapes }]
      : [];
  });
}
