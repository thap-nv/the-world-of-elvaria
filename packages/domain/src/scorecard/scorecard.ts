// The territory's scorecard (PS-25, implementation-plan §3.16.1): is a territory ready for characters before a quest
// is given there? A pure function of the territory file, the metrics ledger and one trial (runner-core's
// tryTerritory); `elvaria territory check <id>` runs the trial and prints the card, `doctor` reminds of a territory
// never tried or whose trial failed. 0 mana: no model, and no quest's state is written.
import { gazetteerItem } from './gazetteer.ts';
import { firstPassItem, pathsItem, setAsideItem } from './ledger-items.ts';
import { checkTimeItem, shownBase, trialItem } from './trial-items.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { Metrics } from '../metrics/metrics-of.ts';
import type { Territory } from '../schema/territory.ts';
import type { GazetteerState } from './gazetteer.ts';
import type { ScorecardItem } from './reasons.ts';
import type { TerritoryTrial } from './trial.ts';

export interface ScorecardInput {
  readonly territory: Territory;
  /** The ledger over the whole kingdom (metricsOf without a window). */
  readonly metrics: Metrics;
  /** null: nothing was tried, the territory has no git. */
  readonly trial: TerritoryTrial | null;
  readonly gazetteer: GazetteerState;
}

export interface TerritoryScorecard {
  readonly territory: TerritoryId;
  /** The commit tried, short; null when nothing was. */
  readonly base: string | null;
  /** One per SCORECARD_ITEMS, in its order. */
  readonly items: readonly ScorecardItem[];
  /** The trial passed: quests can start there. The other items say what would make them go better. */
  readonly ready: boolean;
}

export function territoryScorecardOf(input: ScorecardInput): TerritoryScorecard {
  const { territory, metrics, trial, gazetteer } = input;
  const trialPart = trialItem(territory, trial);
  return {
    territory: territory.id,
    base: shownBase(trial),
    items: [
      trialPart,
      checkTimeItem(territory, trial),
      setAsideItem(territory, metrics),
      gazetteerItem(territory, gazetteer),
      pathsItem(territory),
      firstPassItem(territory, metrics),
    ],
    ready: trialPart.status === 'pass',
  };
}
