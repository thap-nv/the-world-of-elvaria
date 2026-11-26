import type { Metrics } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import type { MetricsSection } from './section.ts';

/** Real runs and carried results are separate samples (RC-07). */
export function recheckSection(t: Translate, metrics: Metrics): MetricsSection {
  const data = metrics.check_modes.recheck;
  const lines = [
    ...data.runs_per_check.map((row) => t('cli.metrics.recheck.runs', { ...row })),
    ...data.carried_by_day.map((row) => t('cli.metrics.recheck.day', { ...row })),
    t('cli.metrics.recheck.red_count', { count: data.carried_then_red.length }),
    ...data.carried_then_red.map((row) => t('cli.metrics.recheck.red', { ...row })),
  ];
  return { title: t('cli.metrics.recheck.title'), lines };
}
