// The ledger's table "after the reminder" (PS-28c): per tribe, the assignee sessions the Steward reminded at the soft
// ceiling that have ended, how many ended on their own and how many were cut, and what they spent from the reminder to
// their end. Apart from view.ts, which is near its limit.
import type { Metrics } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { NONE } from '../listing.ts';
import { count, tableSection } from './section.ts';
import type { MetricsSection } from './section.ts';

const MINUTE_DIGITS = 1;

const COLUMNS = ['tribe', 'reminded', 'completed', 'cut', 'tokens_after', 'minutes_after'] as const;

export const afterWrapUpSection = (t: Translate, metrics: Metrics): MetricsSection =>
  tableSection(t('cli.metrics.title.after_wrap_up'), t('cli.metrics.none'), {
    header: COLUMNS.map((column) => t(`cli.metrics.column.${column}`)),
    rows: metrics.after_wrap_up.map((row) => [
      row.tribe ?? NONE,
      count(row.reminded),
      count(row.completed),
      count(row.cut),
      row.median_tokens === null ? NONE : count(row.median_tokens),
      row.median_minutes.toFixed(MINUTE_DIGITS),
    ]),
  });
