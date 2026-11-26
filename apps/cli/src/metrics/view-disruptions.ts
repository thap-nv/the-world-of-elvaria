import type { Disruption } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { tableSection } from './section.ts';
import type { MetricsSection } from './section.ts';
import type { DisruptionReading } from './read-disruptions.ts';

const MS_PER_MINUTE = 60_000;
const LATEST_SHOWN = 3;

const minutesOf = (entry: Disruption): number =>
  entry.minutes ?? Math.floor((Date.parse(entry.to) - Date.parse(entry.from)) / MS_PER_MINUTE);

export function disruptionsSection(t: Translate, reading: DisruptionReading): MetricsSection {
  const title = t('cli.metrics.title.disruptions');
  if (!reading.ok)
    return {
      title,
      lines: reading.issues.map((issue) =>
        t('cli.metrics.disruptions.issue', {
          file: reading.file,
          path: issue.path.join('.'),
          issue: t(`cli.metrics.disruptions.${issue.code}`),
          message: issue.message,
        }),
      ),
    };
  return tableSection(title, t('cli.metrics.none'), {
    header: ['kind', 'count', 'minutes', 'latest'].map((column) =>
      t(`cli.metrics.disruptions.${column}` as 'cli.metrics.disruptions.kind'),
    ),
    rows: reading.kinds.flatMap(({ id }) => {
      const entries = reading.disruptions.filter(({ kind }) => kind === id);
      return entries.length === 0
        ? []
        : [
            [
              id,
              String(entries.length),
              String(entries.reduce((sum, entry) => sum + minutesOf(entry), 0)),
              entries
                .slice(-LATEST_SHOWN)
                .reverse()
                .map(({ evidence }) => evidence[0])
                .join(', '),
            ],
          ];
    }),
  });
}
