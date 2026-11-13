// The metrics ledger as sections of lines and tables, in the owner's language: `elvaria metrics` prints them as
// plain columns, scripts/docs-metrics-report.mjs as Markdown, so the command and docs/metrics-report.md say the same.
import { REWORK_CAUSES } from '@elvaria/domain';
import type { Metrics, MetricsWindow, PassRate, Rework, ReworkCause } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { NONE } from '../listing.ts';
import { count, tableSection } from './section.ts';
import { amendmentsSection, memosSection, objectionsSection } from './view-memos.ts';
import { firstEditsLine, graphLine, promptSection } from './view-sessions.ts';
import { adviceSection, passByRunSection, statusTimesSection } from './view-waits.ts';
import type { MetricsSection } from './section.ts';

export type { MetricsSection, MetricsTable } from './section.ts';

/** One day's ledger, for the report's table by day. */
export interface DayMetrics {
  readonly day: string;
  readonly metrics: Metrics;
}

const PERCENT = 100;
const MINUTE_DIGITS = 1;

const rateText = ({ passed, decided }: PassRate): string =>
  decided === 0 ? NONE : `${Math.round((passed / decided) * PERCENT)} %`;
const minutes = (value: number): string => value.toFixed(MINUTE_DIGITS);

export const causeCounts = (rework: readonly Rework[]): Record<ReworkCause, number> =>
  Object.fromEntries(
    REWORK_CAUSES.map((cause) => [cause, rework.filter((entry) => entry.cause === cause).length]),
  ) as Record<ReworkCause, number>;

/** `infra/output/question/unknown` counts, as the per-quest and per-day tables show them. */
const causeSplit = (counts: Readonly<Record<ReworkCause, number>>): string =>
  REWORK_CAUSES.map((cause) => counts[cause]).join('/');

export function windowText(t: Translate, window: MetricsWindow): string {
  if (window.since === undefined && window.until === undefined) return t('cli.metrics.window.all');
  return t('cli.metrics.window.range', { since: window.since ?? '…', until: window.until ?? '…' });
}

function summarySection(t: Translate, metrics: Metrics): MetricsSection {
  const { runs, first_pass: rates, sealed } = metrics;
  const causes = causeCounts(metrics.rework);
  const commands = metrics.owner_commands.reduce((total, entry) => total + entry.count, 0);
  const stepped = metrics.quests.filter(({ owner_commands }) => owner_commands > 0).length;
  const span = sealed.reduce((total, quest) => total + quest.span_minutes, 0);
  return {
    title: t('cli.metrics.title.summary', { window: windowText(t, metrics.window) }),
    lines: [
      t('cli.metrics.line.runs', { ...runs }),
      t('cli.metrics.line.rework', { total: metrics.rework.length, ...causes }),
      t('cli.metrics.line.first_pass', {
        passed: rates.overall.passed,
        decided: rates.overall.decided,
        rate: rateText(rates.overall),
      }),
      t('cli.metrics.line.escaped', { count: metrics.escaped.length }),
      t('cli.metrics.line.owner', { count: commands, quests: stepped, worked: metrics.quests.length }),
      t('cli.metrics.line.sealed', {
        count: sealed.length,
        tokens: sealed.reduce((total, quest) => total + quest.tokens, 0),
        minutes: sealed.length === 0 ? NONE : minutes(span / sealed.length),
      }),
      t('cli.metrics.line.set_aside', { count: metrics.set_aside.length }),
      t('cli.metrics.line.reads', { total: metrics.reads.total, files: metrics.reads.repeated.length }),
      graphLine(t, metrics),
      firstEditsLine(t, metrics),
      t('cli.metrics.line.out_of_scope', {
        count: metrics.out_of_scope.length,
        files: metrics.out_of_scope.reduce((total, { paths }) => total + paths.length, 0),
      }),
    ],
  };
}

interface ReworkGroup {
  readonly cause: ReworkCause;
  readonly by: Rework['by'];
  readonly value: string | null;
  readonly entries: readonly Rework[];
}

function reworkGroups(rework: readonly Rework[]): ReworkGroup[] {
  const groups = new Map<string, ReworkGroup>();
  for (const entry of rework) {
    const key = `${entry.cause}|${entry.by}|${String(entry.value)}`;
    const group = groups.get(key) ?? { cause: entry.cause, by: entry.by, value: entry.value, entries: [] };
    groups.set(key, { ...group, entries: [...group.entries, entry] });
  }
  const order = (cause: ReworkCause): number => REWORK_CAUSES.indexOf(cause);
  return [...groups.values()].sort(
    (a, b) => order(a.cause) - order(b.cause) || b.entries.length - a.entries.length,
  );
}

function reworkSection(t: Translate, rework: readonly Rework[]): MetricsSection {
  const ofRole = (group: ReworkGroup, role: Rework['role']) =>
    count(group.entries.filter((entry) => entry.role === role).length);
  return tableSection(t('cli.metrics.title.rework'), t('cli.metrics.none'), {
    header: ['cause', 'by', 'value', 'assignee', 'verifier', 'total'].map((column) =>
      t(`cli.metrics.column.${column}` as 'cli.metrics.column.cause'),
    ),
    rows: reworkGroups(rework).map((group) => [
      t(`cli.metrics.cause.${group.cause}`),
      t(`cli.metrics.by.${group.by}`),
      group.value ?? NONE,
      ofRole(group, 'assignee'),
      ofRole(group, 'verifier'),
      count(group.entries.length),
    ]),
  });
}

const GROUPS = ['class', 'tag', 'model', 'kind', 'territory'] as const;

function firstPassSection(t: Translate, metrics: Metrics): MetricsSection {
  const rates = metrics.first_pass;
  const byGroup = {
    class: rates.by_class,
    tag: rates.by_tag,
    model: rates.by_model,
    kind: rates.by_kind,
    territory: rates.by_territory,
  };
  return tableSection(t('cli.metrics.title.first_pass'), t('cli.metrics.none'), {
    header: ['group', 'key', 'passed', 'decided', 'rate'].map((column) =>
      t(`cli.metrics.column.${column}` as 'cli.metrics.column.group'),
    ),
    rows: GROUPS.flatMap((group) =>
      byGroup[group].map((rate) => [
        t(`cli.metrics.group.${group}`),
        rate.key ?? NONE,
        count(rate.passed),
        count(rate.decided),
        rateText(rate),
      ]),
    ),
  });
}

function ownerSection(t: Translate, metrics: Metrics): MetricsSection {
  return tableSection(t('cli.metrics.title.owner'), t('cli.metrics.none'), {
    header: [t('cli.metrics.column.command'), t('cli.metrics.column.count')],
    rows: metrics.owner_commands.map(({ kind, count: n }) => [kind, count(n)]),
  });
}

function escapedSection(t: Translate, metrics: Metrics): MetricsSection {
  return tableSection(t('cli.metrics.title.escaped'), t('cli.metrics.none'), {
    header: ['quest', 'run', 'fail_kind', 'rejudge'].map((column) =>
      t(`cli.metrics.column.${column}` as 'cli.metrics.column.quest'),
    ),
    rows: metrics.escaped.map((defect) => [
      defect.quest,
      count(defect.n),
      defect.fail_kind ?? NONE,
      t(defect.rejudge ? 'cli.yes' : 'cli.no'),
    ]),
  });
}

function sealedSection(t: Translate, metrics: Metrics): MetricsSection {
  return tableSection(t('cli.metrics.title.sealed'), t('cli.metrics.none'), {
    header: ['quest', 'tokens', 'span', 'session_minutes'].map((column) =>
      t(`cli.metrics.column.${column}` as 'cli.metrics.column.quest'),
    ),
    rows: metrics.sealed.map((quest) => [
      quest.quest,
      count(quest.tokens),
      minutes(quest.span_minutes),
      minutes(quest.session_minutes),
    ]),
  });
}

function questSection(t: Translate, metrics: Metrics): MetricsSection {
  return tableSection(t('cli.metrics.title.quests'), t('cli.metrics.none'), {
    header: ['quest', 'kind', 'class', 'entries', 'rework', 'first_pass', 'tokens', 'owner_commands'].map(
      (column) => t(`cli.metrics.column.${column}` as 'cli.metrics.column.quest'),
    ),
    rows: metrics.quests.map((quest) => [
      quest.id,
      quest.kind,
      quest.class ?? NONE,
      count(quest.entries),
      causeSplit(quest.rework),
      quest.first_pass === null ? NONE : t(quest.first_pass ? 'cli.yes' : 'cli.no'),
      count(quest.tokens),
      count(quest.owner_commands),
    ]),
  });
}

/** The rows of the repeated reads: a kingdom's log has thousands; the most read say which quest leafed a file. */
const READS_SHOWN = 10;

/** The files a session read more than once (PS-01b; Q10 of P1-50 read one 1 MB file 25 times). */
function readsSection(t: Translate, metrics: Metrics): MetricsSection {
  return tableSection(t('cli.metrics.title.reads', { shown: READS_SHOWN }), t('cli.metrics.none'), {
    header: ['session', 'quest', 'path', 'reads'].map((column) =>
      t(`cli.metrics.column.${column}` as 'cli.metrics.column.session'),
    ),
    rows: metrics.reads.repeated
      .slice(0, READS_SHOWN)
      .map((read) => [read.session, read.quest ?? NONE, read.path, count(read.reads)]),
  });
}

const LIMITS = [
  'rule',
  'check',
  'crash',
  'cancelled',
  'day',
  'set_aside',
  'reads',
  'first_edits',
  'prompts',
  'status_times',
  'advice',
] as const;

const limitsSection = (t: Translate): MetricsSection => ({
  title: t('cli.metrics.title.limits'),
  lines: LIMITS.map((limit) => t(`cli.metrics.limit.${limit}`)),
});

/** Every section of the ledger, in the order the command prints them. */
export const metricsSections = (t: Translate, metrics: Metrics): MetricsSection[] => [
  summarySection(t, metrics),
  reworkSection(t, metrics.rework),
  firstPassSection(t, metrics),
  passByRunSection(t, metrics),
  ownerSection(t, metrics),
  adviceSection(t, metrics),
  escapedSection(t, metrics),
  sealedSection(t, metrics),
  statusTimesSection(t, metrics),
  questSection(t, metrics),
  memosSection(t, metrics),
  objectionsSection(t, metrics),
  amendmentsSection(t, metrics),
  readsSection(t, metrics),
  promptSection(t, metrics),
  limitsSection(t),
];

/** The report's table by day: entries, rework by cause, first passes and the owner's commands. */
export function daysSection(t: Translate, days: readonly DayMetrics[]): MetricsSection {
  return tableSection(t('cli.metrics.title.days'), t('cli.metrics.none'), {
    header: ['day', 'entries', 'rework', 'first_pass', 'owner_commands'].map((column) =>
      t(`cli.metrics.column.${column}` as 'cli.metrics.column.day'),
    ),
    rows: days.map(({ day, metrics }) => [
      day,
      count(metrics.runs.entries),
      `${count(metrics.rework.length)} (${causeSplit(causeCounts(metrics.rework))})`,
      `${count(metrics.first_pass.overall.passed)}/${count(metrics.first_pass.overall.decided)}`,
      count(metrics.owner_commands.reduce((total, entry) => total + entry.count, 0)),
    ]),
  });
}
