// `elvaria metrics --plan <quest>` as sections (implementation-plan §3.16.6 "Tổng kết", PS-06b): how a plan's
// sub-quests went against what it said of them, from planAccuracyOf. The same shape as the ledger's sections, so
// `--json` aside it prints the same way.
import { REWORK_CAUSES } from '@elvaria/domain';
import type { PlanAccuracy, PlanPart, ReworkCause } from '@elvaria/domain';
import type { MessageKey, Translate } from '@elvaria/i18n';

import { QUEST_STATUS_LABEL } from '../labels.ts';
import { NONE } from '../listing.ts';
import { count, tableSection } from './section.ts';
import { shareText } from './view-waits.ts';
import type { MetricsSection } from './section.ts';

const columns = (t: Translate, keys: readonly string[]): string[] =>
  keys.map((key) => t(`cli.metrics.column.${key}` as MessageKey));

const sumOf = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

const causeSplit = (counts: Readonly<Record<ReworkCause, number>>): string =>
  REWORK_CAUSES.map((cause) => counts[cause]).join('/');

function summarySection(t: Translate, accuracy: PlanAccuracy): MetricsSection {
  const { plan, parts, totals } = accuracy;
  const title = t('cli.metrics.title.plan', {
    id: plan.id,
    title: plan.title,
    status: t(QUEST_STATUS_LABEL[plan.status]),
  });
  if (parts.length === 0) return { title, lines: [t('cli.metrics.plan.none')] };
  const begun = parts.filter(({ first_run: run }) => run !== null);
  return {
    title,
    lines: [
      t('cli.metrics.plan.line.parts', {
        parts: parts.length,
        begun: begun.length,
        outside: totals.outside,
        memos: totals.memos,
      }),
      t('cli.metrics.plan.line.estimate', {
        estimate: totals.estimate.tokens,
        first_run: totals.first_run.tokens,
        // The estimates of the parts that began, beside what their first runs took.
        ratio: shareText(totals.first_run.tokens, sumOf(begun.map(({ estimate }) => estimate.tokens))),
        tokens: totals.tokens,
        plan: plan.tokens,
      }),
      t('cli.metrics.line.rework', { total: sumOf(Object.values(totals.rework)), ...totals.rework }),
    ],
  };
}

const partRow = (t: Translate, part: PlanPart): string[] => [
  part.quest,
  part.class ?? NONE,
  t(QUEST_STATUS_LABEL[part.status]),
  count(part.scope.length),
  count(part.written.length),
  part.submitted ? count(part.out_of_scope.length) : NONE,
  count(part.estimate.tokens),
  part.first_run === null ? NONE : count(part.first_run.tokens),
  part.first_run === null ? NONE : shareText(part.first_run.tokens, part.estimate.tokens),
  count(part.tokens),
  count(sumOf(Object.values(part.memos))),
  causeSplit(part.rework),
];

const partsSection = (t: Translate, parts: readonly PlanPart[]): MetricsSection =>
  tableSection(t('cli.metrics.title.plan_parts'), t('cli.metrics.none'), {
    header: columns(t, [
      'quest',
      'class',
      'status',
      'scope',
      'written',
      'outside',
      'estimate',
      'first_run_tokens',
      'ratio',
      'tokens',
      'memos',
      'rework',
    ]),
    rows: parts.map((part) => partRow(t, part)),
  });

const outsideSection = (t: Translate, parts: readonly PlanPart[]): MetricsSection =>
  tableSection(t('cli.metrics.title.plan_outside'), t('cli.metrics.none'), {
    header: columns(t, ['quest', 'path']),
    rows: parts.flatMap(({ quest, out_of_scope: paths }) => paths.map((path) => [quest, path])),
  });

const LIMITS = ['parts', 'first_run', 'written'] as const;

/** Every section of a plan's accuracy, in the order the command prints them. */
export function planSections(t: Translate, accuracy: PlanAccuracy): MetricsSection[] {
  const limits = {
    title: t('cli.metrics.title.limits'),
    lines: LIMITS.map((limit) => t(`cli.metrics.plan.limit.${limit}`)),
  };
  if (accuracy.parts.length === 0) return [summarySection(t, accuracy), limits];
  return [
    summarySection(t, accuracy),
    partsSection(t, accuracy.parts),
    outsideSection(t, accuracy.parts),
    limits,
  ];
}
