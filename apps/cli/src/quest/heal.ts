// A quest in its run's heal (ADR 0034, HL-02): the territory's hooks refused the submit commit of its doer's finished
// work, and the quest went back, with no bell, for one fresh session of the same run that mends what they named.
// `quest list` marks it while it waits for that session and while the session runs; `quest show` says why, from the
// journal's `quest.heal_due` line, since the quest file keeps no reason.
import { awaitsHeal, currentRun, isEventOf } from '@elvaria/domain';
import type { Event, EventOf, Quest } from '@elvaria/domain';
import type { MessageKey, Translate } from '@elvaria/i18n';

import { whyLines } from './infirmary.ts';

type HealState = 'due' | 'session';

/**
 * Waiting for the heal session (`returned`, awaitsHeal: its last entry `due`, or a healer's session of the run that
 * ended without the heal, HL-04), or in it (`working` for the doer's own, `healing` for a healer's; its open entry
 * `session`).
 */
function healStateOf(quest: Quest): HealState | undefined {
  if (quest.status === 'returned' && awaitsHeal(quest)) return 'due';
  const open = quest.attempt_log.at(-1);
  const heals = open?.role === 'assignee' && open.heal === 'session' && open.ended_at === undefined;
  return (quest.status === 'working' || quest.status === 'healing') && heals ? 'session' : undefined;
}

const MARK: Readonly<Record<HealState, MessageKey>> = {
  due: 'cli.quest.heal.mark_due',
  session: 'cli.quest.heal.mark_session',
};

/** The mark beside the status, for `quest list` and `quest show`; none for a quest not in a heal. */
export function healMark(t: Translate, quest: Quest): string | undefined {
  const state = healStateOf(quest);
  return state === undefined ? undefined : t(MARK[state]);
}

/** Why the run is healed: the refusal as the infirmary would have said it, indented under one line. */
export function healLines(t: Translate, quest: Quest, journal: readonly Event[]): string[] {
  if (healStateOf(quest) === undefined) return [];
  const n = currentRun(quest);
  const line = journal.findLast(
    (event): event is EventOf<'quest.heal_due'> => isEventOf(event, 'quest.heal_due') && event.attempt === n,
  );
  const why = line === undefined ? [] : whyLines(t, line.data.reason, undefined);
  return ['', t('cli.quest.heal.why', { run: n }), ...why.map((text) => `  ${text}`)];
}
