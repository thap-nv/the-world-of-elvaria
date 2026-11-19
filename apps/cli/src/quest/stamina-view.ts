// The stamina bar of a quest's running session in `quest show` (PS-28b, docs/plans/session-stamina.md): folded from the
// quest's journal by sessionStaminaOf (PS-28), never computed again here, so it says what the Steward's notch lines
// said. Ten cells of what is left of the way to the cut, a mark where the assignee is reminded, the gauge it follows,
// then the fixed sentence that it measures the way to the cut and not the work left. After a cut that went on in a
// fresh session (ADR 0030), a sentence says so.
import { barOf, sessionStaminaOf } from '@elvaria/domain';
import type { Event, Quest, SessionStamina, Stamina } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { NONE } from '../listing.ts';
import { atPct, figureOf, measureName } from './ceiling.ts';
import type { CeilingRules } from './ceiling.ts';

const CELLS = 10;
const FULL = '█';
const EMPTY = '░';
const MARK = '|';

/** Ten cells, the left ones full for what is left, and the reminder mark between two cells when there is one. */
export function barText(left_pct: number, mark_left_pct: number | undefined): string {
  const full = Math.round((left_pct * CELLS) / 100);
  const cells = Array.from({ length: CELLS }, (_, cell): string => (cell < full ? FULL : EMPTY));
  if (mark_left_pct !== undefined) cells.splice(Math.round((mark_left_pct * CELLS) / 100), 0, MARK);
  return cells.join('');
}

/** The session the fold found is the one the quest file says runs: an open seat of the same role. */
function seatOpen(quest: Quest, bar: SessionStamina): boolean {
  if (bar.role === 'verifier') return quest.status === 'review' && typeof quest.verifier === 'string';
  return quest.status === 'working';
}

function gaugeText(t: Translate, stamina: Stamina | undefined, at: string | undefined): string {
  if (stamina === undefined) return t('cli.quest.stamina.full');
  const { measure } = stamina;
  return t('cli.quest.stamina.gauge', {
    measure: measureName(t, measure),
    used: figureOf(measure, stamina.used),
    limit: figureOf(measure, stamina.limit),
    cut: figureOf(measure, atPct(stamina.limit, stamina.hard_pct)),
    at: at ?? NONE,
  });
}

/** The sentence of the cut before this session, in the same run, that it goes on from. */
function previousLine(t: Translate, bar: SessionStamina): string[] {
  const { previous } = bar;
  if (previous === undefined) return [];
  const run = bar.attempt ?? NONE;
  const measure = previous.stamina?.measure;
  return [
    measure === undefined
      ? t('cli.quest.stamina.previous_early', { run })
      : t('cli.quest.stamina.previous', { run, measure: measureName(t, measure) }),
  ];
}

/**
 * `quest show`: the bar of the quest's running session, from its journal; none when no session runs. Before its first
 * notch line the bar is full, with its mark where the kingdom's thresholds put it (barOf of an unspent gauge).
 */
export function staminaLines(
  t: Translate,
  quest: Quest,
  journal: readonly Event[],
  thresholds: Pick<CeilingRules, 'soft_pct' | 'hard_pct'>,
): string[] {
  const bar = sessionStaminaOf(journal).get(quest.id);
  if (bar === undefined || !seatOpen(quest, bar)) return [];
  const role = bar.role ?? 'assignee';
  const { soft_pct, hard_pct } = thresholds;
  const drawn = bar.stamina ?? barOf({ measure: 'time', used: 0, limit: 1, soft_pct, hard_pct, role });
  const zone = bar.zone === 'ok' ? [] : [t(`cli.quest.stamina.zone.${bar.zone}`)];
  const line = t('cli.quest.stamina.line', {
    bar: barText(bar.left_pct, drawn.mark_left_pct),
    left: Math.round(bar.left_pct),
    who: t(`cli.quest.stamina.who.${role}`, { character: bar.character ?? NONE }),
    gauge: [gaugeText(t, bar.stamina, bar.at), ...zone].join(' · '),
  });
  return ['', line, t('cli.quest.stamina.legend'), ...previousLine(t, bar)];
}
