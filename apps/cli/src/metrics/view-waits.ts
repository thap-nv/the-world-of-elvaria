// Three sections of the ledger the research session asked for (owner 2026-11-13, §11; PS-06b): how long quests stay in
// each status, the pass rate of each run (the ground for `max_attempts`), and how often the owner decides a memo the
// way the Chancellor's triage advised (the ground for `delegation.max_rank`). Apart from view.ts, which is near its
// limit.
import type { Metrics, StatusTime } from '@elvaria/domain';
import type { MessageKey, Translate } from '@elvaria/i18n';

import { QUEST_STATUS_LABEL } from '../labels.ts';
import { NONE } from '../listing.ts';
import { count, tableSection } from './section.ts';
import type { MetricsSection } from './section.ts';

const PERCENT = 100;
const MINUTE_DIGITS = 1;

const columns = (t: Translate, keys: readonly string[]): string[] =>
  keys.map((key) => t(`cli.metrics.column.${key}` as MessageKey));

/** `part` of `whole` as a whole percentage; the dash when there is no whole. */
export const shareText = (part: number, whole: number): string =>
  whole === 0 ? NONE : `${Math.round((part / whole) * PERCENT)} %`;

const minutes = (value: number): string => value.toFixed(MINUTE_DIGITS);

/** The status by its name, review said with or without its judge. */
function placeText(t: Translate, { status, judge }: StatusTime): string {
  const name = t(QUEST_STATUS_LABEL[status]);
  if (judge === null) return name;
  return t(judge ? 'cli.metrics.status.review_judged' : 'cli.metrics.status.review_waiting', {
    status: name,
  });
}

export const statusTimesSection = (t: Translate, metrics: Metrics): MetricsSection =>
  tableSection(t('cli.metrics.title.status_times'), t('cli.metrics.none'), {
    header: columns(t, ['status', 'stays', 'median_minutes', 'max_minutes']),
    rows: metrics.status_times.map((time) => [
      placeText(t, time),
      count(time.stays),
      minutes(time.median_minutes),
      minutes(time.max_minutes),
    ]),
  });

export const passByRunSection = (t: Translate, metrics: Metrics): MetricsSection =>
  tableSection(t('cli.metrics.title.pass_by_run'), t('cli.metrics.none'), {
    header: columns(t, ['run', 'passed', 'decided', 'rate']),
    rows: metrics.pass_by_run.map(({ run, passed, decided }) => [
      count(run),
      count(passed),
      count(decided),
      shareText(passed, decided),
    ]),
  });

/** Empty when no memo was sent up: the triage never advised the owner (PS-03b). */
export function adviceSection(t: Translate, metrics: Metrics): MetricsSection {
  const { advice } = metrics;
  const title = t('cli.metrics.title.advice');
  if (advice.by_action.length === 0) return { title, lines: [t('cli.metrics.none')] };
  return {
    title,
    lines: [
      t('cli.metrics.line.advice', {
        escalated: advice.escalated,
        decided: advice.decided,
        followed: advice.followed,
        rate: shareText(advice.followed, advice.decided),
      }),
    ],
    table: {
      header: columns(t, ['action', 'escalated', 'decided', 'followed']),
      rows: advice.by_action.map((row) => [
        row.action,
        count(row.escalated),
        count(row.decided),
        count(row.followed),
      ]),
    },
  };
}
