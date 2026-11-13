// The items of the scorecard read from the metrics ledger and the territory file (PS-25): the share of the
// territory's runs of checks set aside for their environment (3), the laws on paths a parallel world needs (5), and
// the territory's first-pass rate (6).
import { FIRST_PASS_MIN_SHARE, RATE_MIN_SAMPLE, SET_ASIDE_MAX_SHARE, percentOf } from './constants.ts';
import { failing, itemOf, reasonOf, standing, unmeasured } from './reasons.ts';
import type { Metrics } from '../metrics/metrics-of.ts';
import type { Territory } from '../schema/territory.ts';
import type { ScorecardItem } from './reasons.ts';

const MIN = { min: RATE_MIN_SAMPLE };

/** (3) Runs of checks set aside because their environment failed (P1-54), over the territory's runs of checks. */
export function setAsideItem(territory: Territory, metrics: Metrics): ScorecardItem {
  const rows = metrics.quests.filter((quest) => quest.territory === territory.id);
  const runs = rows.reduce((total, row) => total + row.check_runs, 0);
  const aside = rows.reduce((total, row) => total + row.checks_set_aside, 0);
  if (runs < RATE_MIN_SAMPLE) return unmeasured('set_aside', reasonOf('few_check_runs', { runs, ...MIN }));
  const reason = reasonOf('set_aside_rate', {
    set_aside: aside,
    runs,
    rate: percentOf(aside, runs),
    max: percentOf(SET_ASIDE_MAX_SHARE, 1),
  });
  return itemOf('set_aside', [aside / runs > SET_ASIDE_MAX_SHARE ? failing(reason) : standing(reason)]);
}

/**
 * (5) `shared_paths` (PS-05) and `laws.protected_paths` (PS-04) declared, an empty list included: both are optional
 * so that a territory.json written before them still reads, which leaves a territory that never thought of them
 * looking like one that has none.
 */
export function pathsItem(territory: Territory): ScorecardItem {
  const shared = territory.shared_paths;
  const guarded = territory.laws.protected_paths;
  return itemOf('paths', [
    shared === undefined
      ? failing(reasonOf('shared_paths_missing'))
      : standing(reasonOf('shared_paths_declared', { count: shared.length })),
    guarded === undefined
      ? failing(reasonOf('protected_paths_missing'))
      : standing(reasonOf('protected_paths_declared', { count: guarded.length })),
  ]);
}

/** (6) The territory's first-pass rate in the ledger (`by_territory`). */
export function firstPassItem(territory: Territory, metrics: Metrics): ScorecardItem {
  const rate = metrics.first_pass.by_territory.find(({ key }) => key === territory.id);
  const decided = rate?.decided ?? 0;
  const passed = rate?.passed ?? 0;
  if (decided < RATE_MIN_SAMPLE)
    return unmeasured('first_pass', reasonOf('few_decided', { decided, ...MIN }));
  const reason = reasonOf('first_pass_rate', {
    passed,
    decided,
    rate: percentOf(passed, decided),
    min: percentOf(FIRST_PASS_MIN_SHARE, 1),
  });
  return itemOf('first_pass', [passed / decided < FIRST_PASS_MIN_SHARE ? failing(reason) : standing(reason)]);
}
