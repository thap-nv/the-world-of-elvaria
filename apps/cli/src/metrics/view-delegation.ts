// The delegation of the seal in the ledger (PS-08b, ADR 0023): per territory, the quests the Steward merged in the
// window, how many of them went without the seal, and (PS-08g) how many of those a signal of the breaker named; then
// the defects the owner reported after a merge (`elvaria quest escaped`), sealed or not. Apart from view.ts, which is
// near its limit.
import { count, tableSection } from './section.ts';
import type { MetricsSection } from './section.ts';
import type { Metrics } from '@elvaria/domain';
import type { MessageKey, Translate } from '@elvaria/i18n';

const NONE = '—';

const header = (t: Translate, columns: readonly string[]): string[] =>
  columns.map((key) => t(`cli.metrics.column.${key}` as MessageKey));

export const unsealedSection = (t: Translate, metrics: Metrics): MetricsSection =>
  tableSection(t('cli.metrics.title.unsealed'), t('cli.metrics.none'), {
    header: header(t, ['territory', 'merged', 'unsealed', 'escaped']),
    rows: metrics.unsealed.map(({ territory, merged, unsealed, escaped }) => [
      territory,
      count(merged),
      count(unsealed),
      count(escaped),
    ]),
  });

export const reportedEscapesSection = (t: Translate, metrics: Metrics): MetricsSection =>
  tableSection(t('cli.metrics.title.reported_escapes'), t('cli.metrics.none'), {
    header: header(t, ['quest', 'territory', 'reported_at', 'unsealed', 'note']),
    rows: metrics.reported_escapes.map(({ quest, territory, at, delegated, note }) => [
      quest,
      territory,
      at,
      t(delegated ? 'cli.yes' : 'cli.no'),
      note ?? NONE,
    ]),
  });
