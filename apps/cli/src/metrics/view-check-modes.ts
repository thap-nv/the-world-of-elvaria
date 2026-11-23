import type { Metrics } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { NONE } from '../listing.ts';
import type { MetricsSection } from './section.ts';

const MINUTE_DIGITS = 2;
const minutes = (value: number | null): string => (value === null ? NONE : value.toFixed(MINUTE_DIGITS));

/** Shared by the terminal ledger and the generated Markdown report (CM-09a). */
export function checkModesSection(t: Translate, metrics: Metrics): MetricsSection {
  const data = metrics.check_modes;
  const title = t('cli.metrics.title.check_modes');
  if (data.full_by_day.length === 0 && data.durations.every((row) => row.count === 0))
    return { title, lines: [t('cli.metrics.check_modes.none')] };
  return {
    title,
    lines: [
      t('cli.metrics.check_modes.measure'),
      ...data.durations
        .filter((row) => row.count > 0)
        .map((row) =>
          t('cli.metrics.check_modes.duration', {
            mode: t(`cli.metrics.check_modes.mode.${row.mode}`),
            count: row.count,
            median: minutes(row.median_minutes),
            p90: minutes(row.p90_minutes),
          }),
        ),
      ...data.full_by_day.map((row) => t('cli.metrics.check_modes.day', { ...row })),
      t('cli.metrics.check_modes.cost', {
        count: data.merged_cost.quests.length,
        median: minutes(data.merged_cost.median_minutes),
        total: minutes(data.merged_cost.total_minutes),
      }),
      ...data.merged_cost.quests.map((row) =>
        t('cli.metrics.check_modes.quest_cost', {
          quest: row.quest,
          minutes: minutes(row.minutes),
        }),
      ),
      ...data.base_red.map((row) =>
        t('cli.metrics.check_modes.red', {
          territory: row.territory,
          check: row.check,
          since: row.since,
          until: row.until ?? t('cli.metrics.check_modes.still_red'),
          minutes: minutes(row.minutes),
        }),
      ),
      t('cli.metrics.check_modes.merge', {
        count: data.submit_to_merge.count,
        median: minutes(data.submit_to_merge.median_minutes),
        p90: minutes(data.submit_to_merge.p90_minutes),
      }),
      ...data.peaks.map((row) => t('cli.metrics.check_modes.peak', { ...row })),
    ],
  };
}
