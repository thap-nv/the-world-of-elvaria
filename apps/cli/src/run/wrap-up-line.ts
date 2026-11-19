// The bell at the reminder mark (PS-28b, TL4), in the owner's language: who works or judges which quest and how much of
// which ceiling it used; what follows if the owner does nothing (a cut that goes on in a fresh session for an assignee,
// ADR 0030; a review that starts over with another judge); and the command that lifts the ceiling, with the quest's id
// and the figure it must reach. About five minutes pass from the mark to the cut on a real run (lần (J)), so the line
// carries everything the owner needs.
import type { Translate } from '@elvaria/i18n';
import type { Notice } from '@elvaria/steward';

import { NONE } from '../listing.ts';
import { figureOf, measureName } from '../quest/ceiling.ts';

type WrapUpNotice = Extract<Notice, { kind: 'wrap_up' }>;

/** The command that gives the session more, or why there is none: turns have no knob per quest. */
function raiseText(t: Translate, notice: WrapUpNotice): string {
  const { quest, raise_from: from, measure } = notice;
  if (from === undefined || measure === 'turns') return t('cli.run.notice.wrap_up_no_knob');
  const key =
    measure === 'time' ? 'cli.run.notice.wrap_up_raise_minutes' : 'cli.run.notice.wrap_up_raise_tokens';
  return t(key, { quest: quest.id, from });
}

export function wrapUpLine(t: Translate, notice: WrapUpNotice): string {
  const { quest, measure, role } = notice;
  return t(`cli.run.notice.wrap_up_${role}`, {
    quest: quest.id,
    title: quest.title,
    character: notice.character ?? NONE,
    used: figureOf(measure, notice.used),
    limit: figureOf(measure, notice.limit),
    cut: figureOf(measure, notice.cut_at),
    unit: measureName(t, measure),
    raise: raiseText(t, notice),
  });
}
