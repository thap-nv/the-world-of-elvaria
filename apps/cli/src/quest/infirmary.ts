// Why a quest waits in the infirmary (implementation-plan §3.4, P1-32): `quest show` reads the last `quest.infirmary`
// line of the quest's journal, since the quest file keeps no reason, and says it in the owner's language: the trip,
// the attempt, then each part of the detail. The reason is a code and params (contract infirmary-reason-codes);
// a line written before it (`legacy`) says its trip as before, or, with no trip, its English reason verbatim.
import { isEventOf } from '@elvaria/domain';
import type {
  Event,
  EventOf,
  InfirmaryDetail,
  InfirmaryReason,
  InfirmaryReasonCode,
  InfirmaryTrip,
  Quest,
} from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import type { MessageKey, Translate } from '@elvaria/i18n';
import { PATCH_FILE } from '@elvaria/runner-core';

import { reasonText } from './infirmary-reason.ts';
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

/** Codes whose sentence already counts the partial verdicts, so the detail only adds what to do. */
const COUNTS_PARTIALS: ReadonlySet<InfirmaryReasonCode> = new Set([
  'judge:partial_verdicts',
  'judge:partial_verdicts_until',
  'restart:partial_verdicts',
]);

/** A reason written before contract v2 said nothing the detail says (contract §2, `legacy`). */
const SAID_NOTHING: InfirmaryReason = { code: 'legacy', params: { text: '' } };

/** The verifiers that left without a verdict: their count, unless the reason gave it, then what to do. */
function stoppedLine(t: Translate, stopped: number, reason: InfirmaryReason): string {
  return 'stopped' in reason.params
    ? t('cli.quest.infirmary.detail.verifiers_stopped_advice')
    : t('cli.quest.infirmary.detail.verifiers_stopped', { count: stopped });
}

function partialsLine(t: Translate, partials: number, reason: InfirmaryReason): string {
  return COUNTS_PARTIALS.has(reason.code)
    ? t('cli.quest.infirmary.detail.partial_verdicts_advice')
    : t('cli.quest.infirmary.detail.partial_verdicts', { count: partials });
}

/**
 * One line per part of the detail, in the order the Steward's reason says them; the bell says them too. What the
 * sentence of `reason` already said is not said again (contract §1.4): the refused patch, the script, the follow-up.
 */
export function detailLines(t: Translate, detail: InfirmaryDetail, reason = SAID_NOTHING): string[] {
  const { message, patch, wip, paths, script, follow_up: followUp, verifiers_stopped: stopped } = detail;
  const partials = detail.partial_verdicts;
  const said = reason.params;
  return [
    ...(message === undefined ? [] : [t('cli.quest.infirmary.detail.message', { message })]),
    ...(patch === undefined || 'why' in said
      ? []
      : [t('cli.quest.infirmary.detail.patch', { file: PATCH_FILE, why: patch })]),
    ...(paths === undefined ? [] : [pathsLine(t, paths)]),
    ...(wip === undefined ? [] : [t('cli.quest.infirmary.detail.wip', { why: wip })]),
    ...(detail.apprentice_left === true ? [t('cli.quest.infirmary.detail.apprentice_left')] : []),
    ...(stopped === undefined ? [] : [stoppedLine(t, stopped, reason)]),
    ...(partials === undefined ? [] : [partialsLine(t, partials, reason)]),
    ...(script === undefined || 'script' in said ? [] : [t('cli.quest.infirmary.detail.script', { script })]),
    ...(followUp === undefined || 'follow_up' in said
      ? []
      : [t('cli.quest.infirmary.detail.follow_up', { quest: followUp })]),
  ];
}

/**
 * Why, as the head of the reason: a line written before contract v2 with a trip says its trip as it always did;
 * every other line says its `reason` (a `legacy` one without a trip: its old words verbatim). The lines after the
 * first are the refusing hook's, already indented.
 */
export function whyLines(t: Translate, reason: InfirmaryReason, trip: InfirmaryTrip | undefined): string[] {
  if (reason.code === 'legacy' && trip !== undefined) return [tripLabel(t, trip)];
  return reasonText(t, reason).split('\n');
}

/** The reason in the owner's language: why and in which attempt, then the detail, indented. */
export function infirmaryLines(t: Translate, line: InfirmaryLine): string[] {
  const { trip, detail = {}, reason } = line.data;
  const [why = '', ...hook] = whyLines(t, reason, trip);
  const head =
    line.attempt === undefined
      ? t('cli.quest.infirmary.head', { why })
      : t('cli.quest.infirmary.head_run', { why, run: line.attempt });
  return [head, ...[...hook, ...detailLines(t, detail, reason)].map((text) => `  ${text}`)];
}
