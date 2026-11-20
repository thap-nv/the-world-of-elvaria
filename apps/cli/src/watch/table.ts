// Read-only board: snapshot files remain authoritative; the log supplies the mana readings.
import { attentionQueue } from '@elvaria/domain';
import type { Event, Instant, WorldSource } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';
import { digestStateOf } from '@elvaria/steward';

import { digestMarkdown } from '../digest/markdown.ts';
import { QUEST_STATUS_LABEL } from '../labels.ts';
import { NONE } from '../listing.ts';
import { renderTable } from '../table.ts';

export type WatchSource = Omit<WorldSource, 'campaigns'>;

/** Pure rendering; all time and data come from the caller. */
export function watchTable(
  t: Translate,
  source: WatchSource,
  events: readonly Event[],
  now: Instant,
): string {
  const quests = source.quests
    .filter(({ status }) => status !== 'done' && status !== 'archived')
    .toSorted((a, b) => a.id.localeCompare(b.id));
  const board =
    quests.length === 0
      ? [t('cli.watch.empty')]
      : renderTable([
          [t('cli.column.id'), t('cli.column.title'), t('cli.column.assignee'), t('cli.column.status')],
          ...quests.map((quest) => [
            quest.id,
            quest.title.replace(/[\r\n\t]/g, ' '),
            quest.assignee ?? NONE,
            t(QUEST_STATUS_LABEL[quest.status]),
          ]),
        ]);
  const items = attentionQueue(digestStateOf({ ...source, memos: source.memos ?? [] }, events), now);
  if (items.length === 0) return board.join('\n');
  const attention = digestMarkdown(t, { day: '', name: source.kingdom.name, items });
  return [...board, '', t('cli.watch.attention'), ...attention.trimEnd().split('\n').slice(2)].join('\n');
}
