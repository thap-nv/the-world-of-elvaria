// The delegation of the seal in the ledger (PS-08b, ADR 0023): per territory, the quests the Steward merged in the
// window and how many of them went without the seal; PS-08g adds the defects that escaped among them. Apart from
// view.ts, which is near its limit.
import { count, tableSection } from './section.ts';
import type { MetricsSection } from './section.ts';
import type { Metrics } from '@elvaria/domain';
import type { MessageKey, Translate } from '@elvaria/i18n';

export const unsealedSection = (t: Translate, metrics: Metrics): MetricsSection =>
  tableSection(t('cli.metrics.title.unsealed'), t('cli.metrics.none'), {
    header: ['territory', 'merged', 'unsealed'].map((key) => t(`cli.metrics.column.${key}` as MessageKey)),
    rows: metrics.unsealed.map(({ territory, merged, unsealed }) => [
      territory,
      count(merged),
      count(unsealed),
    ]),
  });
