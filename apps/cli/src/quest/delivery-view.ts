// What `quest show` says of a done quest's delivery to its forge (PS-08c): its pull request, or where the delivery
// stopped, why, and how to send it again. Read from the quest's journal, which carries its `delivery.*` lines and the
// owner's `deliver` (forgeOutcomesOf): the quest file keeps no field for it. (PS-09b) A stop that opened a merge quest
// names it: the quest waits for it rather than for the owner.
import { forgeOutcomesOf } from '@elvaria/domain';
import type { Event, Quest } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

const SHORT_SHA = 7;
/** The end of git's or the forge's message: the last lines say why. */
const DETAIL_LINES = 8;

const indented = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(-DETAIL_LINES)
    .map((line) => `    ${line}`);

/** The lines, after a blank one; none for a quest that never went to a forge, or whose outcome was forgotten. */
export function deliveryLines(t: Translate, quest: Quest, journal: readonly Event[]): string[] {
  const outcome = forgeOutcomesOf(journal).get(quest.id);
  if (outcome === undefined) return [];
  if (outcome.type === 'delivery.pushed') {
    const { pr, head, warnings = [] } = outcome.data;
    const warned =
      warnings.length === 0 ? [] : [t('cli.quest.show.delivery_warnings', { paths: warnings.join(', ') })];
    return [
      '',
      t('cli.quest.show.delivery_pushed', { url: pr.url, head: head.slice(0, SHORT_SHA) }),
      ...warned,
    ];
  }
  if (outcome.type === 'delivery.merged') {
    const { pr, merge_sha: sha } = outcome.data;
    return ['', t('cli.quest.show.delivery_merged', { url: pr.url, sha: sha.slice(0, SHORT_SHA) })];
  }
  const { stage, reason, pr, paths, detail, merge_quest: merge } = outcome.data;
  return [
    '',
    t('cli.quest.show.delivery_failed', {
      stage: t(`cli.forge.stage.${stage}`),
      why: t(`cli.forge.reason.${reason}`),
    }),
    ...(pr === undefined ? [] : [t('cli.quest.show.delivery_pr', { url: pr.url })]),
    ...(paths === undefined ? [] : [t('cli.quest.show.delivery_paths', { paths: paths.join(', ') })]),
    ...(detail === undefined ? [] : indented(detail)),
    merge === undefined
      ? t('cli.quest.show.delivery_again', { id: quest.id })
      : t('cli.quest.show.delivery_merge_quest', { id: quest.id, merge }),
  ];
}
