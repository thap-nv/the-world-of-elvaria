import type { Heals, Metrics } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { NONE } from '../listing.ts';
import type { MetricsSection } from './section.ts';

const percent = (rate: number | null): string => (rate === null ? NONE : `${Math.round(rate * 100)} %`);

function verdictLines(t: Translate, heals: Heals): string[] {
  return (['healed', 'ordinary'] as const).map((kind) =>
    t('cli.metrics.heals.verdict', {
      kind: t(kind === 'healed' ? 'cli.metrics.heals.with_heal' : 'cli.metrics.heals.ordinary'),
      ...heals.verdicts[kind],
      rate: percent(heals.verdicts[kind].rate),
    }),
  );
}

/** A shared table keeps character counts and healer outcomes together in the report's section shape. */
export function healsSection(t: Translate, metrics: Metrics): MetricsSection {
  const title = t('cli.metrics.title.heals');
  const { heals } = metrics;
  if (heals.total === 0) return { title, lines: [t('cli.metrics.heals.none')] };
  return {
    title,
    lines: [
      t('cli.metrics.heals.target'),
      ...verdictLines(t, heals),
      t('cli.metrics.heals.owner_submits', { count: heals.owner_submits }),
    ],
    table: {
      header: ['kind', 'character', 'tribe', 'heals', 'healed', 'rate', 'tokens'].map((column) =>
        t(`cli.metrics.heals.${column}` as 'cli.metrics.heals.kind'),
      ),
      rows: [
        ...heals.by_assignee.map((row) => [
          t('cli.metrics.heals.assignee'),
          row.character ?? NONE,
          row.tribe ?? NONE,
          String(row.heals),
          NONE,
          NONE,
          NONE,
        ]),
        ...heals.by_healer.map((row) => [
          t(`cli.metrics.heals.${row.kind}`),
          NONE,
          row.tribe ?? NONE,
          String(row.heals),
          String(row.healed),
          percent(row.rate),
          String(row.median_tokens ?? NONE),
        ]),
      ],
    },
  };
}
