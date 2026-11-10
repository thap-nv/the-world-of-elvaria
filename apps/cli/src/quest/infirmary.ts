// Why a quest waits in the infirmary (implementation-plan §3.4, P1-32): `quest show` reads the last `quest.infirmary`
// line of the quest's journal, since the quest file keeps no reason, and says it in the owner's language: the trip,
// the attempt, then each part of the detail. A line written before P1-32 has no trip: its English reason is shown.
import { isEventOf } from '@elvaria/domain';
import type { Event, EventOf, InfirmaryDetail, InfirmaryTrip, Quest } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import type { MessageKey, Translate } from '@elvaria/i18n';
import { PATCH_FILE } from '@elvaria/runner-core';

import type { KingdomContext } from '../kingdom-context.ts';

export type InfirmaryLine = EventOf<'quest.infirmary'>;

const TRIP_LABEL: Readonly<Record<InfirmaryTrip, MessageKey>> = {
  time: 'cli.quest.infirmary.trip.time',
  tokens: 'cli.quest.infirmary.trip.tokens',
  turns: 'cli.quest.infirmary.trip.turns',
  commit: 'cli.quest.infirmary.trip.commit',
  secrets: 'cli.quest.infirmary.trip.secrets',
  forbidden_paths: 'cli.quest.infirmary.trip.forbidden_paths',
  no_verdict: 'cli.quest.infirmary.trip.no_verdict',
  partial_verdicts: 'cli.quest.infirmary.trip.partial_verdicts',
  max_attempts: 'cli.quest.infirmary.trip.max_attempts',
  script_broken: 'cli.quest.infirmary.trip.script_broken',
  script_usage: 'cli.quest.infirmary.trip.script_usage',
  script_fail: 'cli.quest.infirmary.trip.script_fail',
};

/** The quest's journal, read once for all `quest show` says from it; none when it cannot be read. */
export async function journalOf(ctx: KingdomContext, quest: Quest): Promise<readonly Event[]> {
  try {
    return (await openJournal(ctx.store.root, quest.id).read()).events;
  } catch {
    return [];
  }
}

/** The last line that sent the quest to the infirmary; none when the journal has none. */
export const lastInfirmaryOf = (journal: readonly Event[]): InfirmaryLine | undefined =>
  journal.findLast((event): event is InfirmaryLine => isEventOf(event, 'quest.infirmary'));

/** What sent the quest there, in the owner's language. */
export const tripLabel = (t: Translate, trip: InfirmaryTrip): string => t(TRIP_LABEL[trip]);

/** At most this many forbidden paths on the line; the journal keeps them all (P1-49). */
const PATHS_SHOWN = 10;

/** The forbidden paths a session left changed (trip forbidden_paths, P1-49), and how many more. */
function pathsLine(t: Translate, paths: readonly string[]): string {
  const shown = paths.slice(0, PATHS_SHOWN).join(', ');
  const more = paths.length - PATHS_SHOWN;
  return more > 0
    ? t('cli.quest.infirmary.detail.paths_more', { paths: shown, count: more })
    : t('cli.quest.infirmary.detail.paths', { paths: shown });
}

/** One line per part of the detail, in the order the Steward's reason says them; the bell says them too. */
export function detailLines(t: Translate, detail: InfirmaryDetail): string[] {
  const { message, patch, wip, paths, script, follow_up: followUp, verifiers_stopped: stopped } = detail;
  const partials = detail.partial_verdicts;
  return [
    ...(message === undefined ? [] : [t('cli.quest.infirmary.detail.message', { message })]),
    ...(patch === undefined ? [] : [t('cli.quest.infirmary.detail.patch', { file: PATCH_FILE, why: patch })]),
    ...(paths === undefined ? [] : [pathsLine(t, paths)]),
    ...(wip === undefined ? [] : [t('cli.quest.infirmary.detail.wip', { why: wip })]),
    ...(detail.apprentice_left === true ? [t('cli.quest.infirmary.detail.apprentice_left')] : []),
    ...(stopped === undefined ? [] : [t('cli.quest.infirmary.detail.verifiers_stopped', { count: stopped })]),
    ...(partials === undefined
      ? []
      : [t('cli.quest.infirmary.detail.partial_verdicts', { count: partials })]),
    ...(script === undefined ? [] : [t('cli.quest.infirmary.detail.script', { script })]),
    ...(followUp === undefined ? [] : [t('cli.quest.infirmary.detail.follow_up', { quest: followUp })]),
  ];
}

/** The reason in the owner's language: why and in which attempt, then the detail, indented. */
export function infirmaryLines(t: Translate, line: InfirmaryLine): string[] {
  const { trip, detail = {}, reason } = line.data;
  const why = trip === undefined ? reason : tripLabel(t, trip);
  const head =
    line.attempt === undefined
      ? t('cli.quest.infirmary.head', { why })
      : t('cli.quest.infirmary.head_run', { why, run: line.attempt });
  return [head, ...detailLines(t, detail).map((text) => `  ${text}`)];
}
