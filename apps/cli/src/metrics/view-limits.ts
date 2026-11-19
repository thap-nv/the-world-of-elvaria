// The known limits the ledger prints at its end, one line each, so a reader never mistakes a gap in the data for a
// result. Apart from view.ts, which is near its limit (300 lines).
import type { Translate } from '@elvaria/i18n';

import type { MetricsSection } from './section.ts';

const LIMITS = [
  'rule',
  'check',
  'crash',
  'cancelled',
  'day',
  'set_aside',
  'reads',
  'first_edits',
  'prompts',
  'status_times',
  'advice',
  'after_wrap_up',
  'raised',
  'lessons',
] as const;

export const limitsSection = (t: Translate): MetricsSection => ({
  title: t('cli.metrics.title.limits'),
  lines: LIMITS.map((limit) => t(`cli.metrics.limit.${limit}`)),
});
